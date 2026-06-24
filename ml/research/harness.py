#!/usr/bin/env python3
"""
Arc Spirits bot — experiment harness (the "run one experiment, reproducibly, and log
everything" core). Karpathy-style: small, hackable, config-driven, no framework magic.

An EXPERIMENT is a JSON config (reward shaping, gamma, exploration, training, eval, the
objective to maximize). `run_experiment` executes the whole pipeline for that config —
optional cold-start behaviour-clone, then N self-play iterations of (generate -> train ->
eval) — shelling out to the existing TypeScript runners (`_gen`/`_eval` via vitest) and the
Python trainer (`train.py`). Every run gets its own directory under runs/ with the frozen
config, per-iteration metrics (metrics.jsonl), a summary, the best weights, and a full log.

The objective is configurable (default: the bot's average final VP in a mixed field) so the
"total VP vs VP/turn vs which gamma" questions are answered by EXPERIMENTS, not by hand-tuning.

CLI:
    python ml/research/harness.py --config ml/research/configs/baseline.json
    python ml/research/harness.py --config ... --tag my_run
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ML = REPO / "ml"
DATA = ML / "data"
WEIGHTS = ML / "weights" / "policy.json"
RUNS = ML / "research" / "runs"
VENV_PY = ML / ".venv" / "bin" / "python"
EVAL_RESULT = ML / "eval_result.json"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "name": "baseline",
    # What to maximize. metric ∈ {avgVP, vpPerTurn, winRate, avgPlace(min)}; opponent is one of
    # the eval opponents (or "mean" to average across them). Default: total VP in a mixed field
    # (NOT vpPerTurn — economy builds pay off late, so per-turn would penalize them).
    "objective": {"metric": "avgVP", "opponent": "mean"},
    # Optional behaviour-clone seed from a heuristic champion before self-play.
    "cold_start": {"games_per_shard": 30, "shards": 6, "record_profile": "pvphunter", "max_rounds": 90},
    "iterations": 3,
    "datagen": {
        "games_per_shard": 40, "shards": 6, "selection": "value",
        "sample": True, "temperature": 1.0, "max_rounds": 100, "seats": 4,
    },
    "shaping": "balanced",   # preset name in shaping.ts SHAPING_PRESETS
    "gamma": 0.99,           # high → values late VP (economy-friendly)
    "train": {"epochs": 12, "beta": 2.0},
    "eval": {"games": 24, "opponents": ["pvphunter", "medium", "mixed"], "max_rounds": 110, "selection": "hybrid"},
}


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_config(path: str | None) -> dict:
    user = json.loads(Path(path).read_text()) if path else {}
    return deep_merge(DEFAULT_CONFIG, user)


def config_id(config: dict) -> str:
    h = hashlib.sha1(json.dumps(config, sort_keys=True).encode()).hexdigest()[:8]
    return f"{config.get('name', 'run')}-{h}"


# ---------------------------------------------------------------------------
# Shelling out to the TS runners + Python trainer
# ---------------------------------------------------------------------------

def _run(cmd: list[str], env_extra: dict, log) -> str:
    env = {**os.environ, **{k: str(v) for k, v in env_extra.items()}}
    log.write(f"\n$ {' '.join(cmd)}\n  env: {env_extra}\n")
    log.flush()
    p = subprocess.run(cmd, cwd=REPO, env=env, capture_output=True, text=True)
    log.write(p.stdout)
    if p.returncode != 0:
        log.write(f"\n[stderr]\n{p.stderr}\n")
    log.flush()
    return p.stdout


def clear_data():
    for f in DATA.glob("*.jsonl"):
        f.unlink()
    meta = DATA / "meta.json"
    if meta.exists():
        meta.unlink()
    if WEIGHTS.exists():
        WEIGHTS.unlink()


def gen_stage(config: dict, mode: str, prefix: str, log, record_profile: str | None = None):
    dg = config["datagen"]
    cs = config.get("cold_start") or {}
    per = cs.get("games_per_shard", dg["games_per_shard"]) if mode == "heur" else dg["games_per_shard"]
    shards = cs.get("shards", dg["shards"]) if mode == "heur" else dg["shards"]
    env = {
        "GEN_MAXROUNDS": cs.get("max_rounds", dg["max_rounds"]) if mode == "heur" else dg["max_rounds"],
        "GEN_SEATS": dg.get("seats", 4),
        "GEN_SELECTION": dg["selection"],
        "GEN_SAMPLE": "1" if dg["sample"] else "0",
        "GEN_TEMP": dg["temperature"],
        "GEN_SHAPING": config["shaping"],
        "GEN_GAMMA": config["gamma"],
    }
    if record_profile is not None:
        env["GEN_RECORD_PROFILE"] = record_profile
    _run(["bash", "ml/run_gen.sh", mode, str(per), str(shards), prefix], env, log)


def train_stage(config: dict, log) -> dict:
    tr = config["train"]
    out = _run(
        [str(VENV_PY), "ml/train.py", "--data", "ml/data", "--out", str(WEIGHTS),
         "--epochs", str(tr["epochs"]), "--beta", str(tr["beta"])],
        {}, log,
    )
    # Parse the last epoch line for a quick training signal.
    metrics = {}
    for line in out.splitlines():
        if line.startswith("Epoch"):
            for tok in line.split("|"):
                if "=" in tok:
                    k, v = tok.split("=")
                    try:
                        metrics[k.strip()] = float(v.strip())
                    except ValueError:
                        pass
    return metrics


def eval_stage(config: dict, log) -> dict:
    ev = config["eval"]
    _run(
        ["npx", "vitest", "run", "src/lib/play/ml/_eval.test.ts", "--disable-console-intercept"],
        {
            "EVAL": "1",
            "EVAL_GAMES": ev["games"],
            "EVAL_OPPONENTS": ",".join(ev["opponents"]),
            "EVAL_MAXROUNDS": ev["max_rounds"],
            "EVAL_SELECTION": ev["selection"],
        },
        log,
    )
    if not EVAL_RESULT.exists():
        return {"results": []}
    return json.loads(EVAL_RESULT.read_text())


# ---------------------------------------------------------------------------
# Objective
# ---------------------------------------------------------------------------

def objective_value(config: dict, eval_data: dict) -> float:
    """Scalar to maximize, computed from one eval's results, per config['objective']."""
    obj = config["objective"]
    metric, opp = obj["metric"], obj["opponent"]
    rows = {r["opponent"]: r for r in eval_data.get("results", [])}
    if not rows:
        return float("-inf")
    if opp == "mean":
        vals = [r.get(metric, 0.0) for r in rows.values()]
        v = sum(vals) / len(vals) if vals else 0.0
    else:
        v = rows.get(opp, {}).get(metric, 0.0)
    return -v if metric == "avgPlace" else v  # placement is better when smaller


# ---------------------------------------------------------------------------
# One experiment
# ---------------------------------------------------------------------------

def run_experiment(config: dict, tag: str | None = None, now: float | None = None) -> dict:
    rid = (tag + "-" if tag else "") + config_id(config)
    run_dir = RUNS / rid
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.json").write_text(json.dumps(config, indent=2))
    metrics_path = run_dir / "metrics.jsonl"
    metrics_path.write_text("")
    started = now if now is not None else time.time()

    best = {"objective": float("-inf"), "iter": -1}
    with open(run_dir / "log.txt", "w") as log:
        log.write(f"=== experiment {rid} ===\nconfig: {json.dumps(config)}\n")
        clear_data()

        if config.get("cold_start"):
            log.write("\n--- cold-start (heuristic champion BC) ---\n")
            gen_stage(config, "heur", "cold", log, record_profile=config["cold_start"].get("record_profile", ""))
            train_stage(config, log)

        for it in range(1, config["iterations"] + 1):
            log.write(f"\n--- iteration {it} ---\n")
            gen_stage(config, "neural", f"it{it}", log)
            tr = train_stage(config, log)
            ev = eval_stage(config, log)
            obj = objective_value(config, ev)
            row = {"iter": it, "objective": obj, "train": tr, "eval": ev.get("results", [])}
            with open(metrics_path, "a") as mf:
                mf.write(json.dumps(row) + "\n")
            log.write(f"iteration {it}: objective={obj:.3f}\n")
            if obj > best["objective"]:
                best = {"objective": obj, "iter": it, "eval": ev.get("results", [])}
                if WEIGHTS.exists():
                    (run_dir / "weights").mkdir(exist_ok=True)
                    (run_dir / "weights" / "policy.json").write_text(WEIGHTS.read_text())

        summary = {
            "run_id": rid,
            "config": config,
            "best_objective": best["objective"],
            "best_iter": best.get("iter", -1),
            "best_eval": best.get("eval", []),
            "iterations": config["iterations"],
            "elapsed_sec": round(time.time() - started, 1),
        }
        (run_dir / "summary.json").write_text(json.dumps(summary, indent=2))
        log.write(f"\n=== DONE: best objective {best['objective']:.3f} at iter {best.get('iter')} ===\n")
    return summary


def leaderboard() -> str:
    """All past runs ranked by best objective — so a coding agent can review results."""
    rows = []
    for d in sorted(RUNS.glob("*/summary.json")):
        try:
            rows.append(json.loads(d.read_text()))
        except json.JSONDecodeError:
            pass
    rows.sort(key=lambda s: s.get("best_objective", float("-inf")), reverse=True)
    out = [f"{'objective':<11}{'iter':<6}{'run_id':<30}gamma  shaping  selection  beta"]
    for s in rows:
        c = s.get("config", {})
        out.append(f"{s.get('best_objective', 0):<11.3f}{s.get('best_iter', -1):<6}{s.get('run_id', ''):<30}"
                   f"{c.get('gamma')}  {c.get('shaping')}  {c.get('datagen', {}).get('selection')}  {c.get('train', {}).get('beta')}")
    return "\n".join(out) if rows else "(no runs yet)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", help="path to experiment config JSON (else defaults)")
    ap.add_argument("--tag", help="optional run tag prefix")
    ap.add_argument("--board", action="store_true", help="print the leaderboard of past runs and exit")
    args = ap.parse_args()
    if args.board:
        print(leaderboard())
        return
    config = load_config(args.config)
    summary = run_experiment(config, tag=args.tag)
    print(json.dumps({"run_id": summary["run_id"], "best_objective": summary["best_objective"],
                      "best_iter": summary["best_iter"], "elapsed_sec": summary["elapsed_sec"]}, indent=2))


if __name__ == "__main__":
    main()
