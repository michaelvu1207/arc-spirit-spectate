# Arc Spirits — Experiment Harness

A small, hackable framework for running bot experiments *as experiments*: define a config, the
harness runs the whole pipeline reproducibly and logs every metric; a leaderboard ranks runs.
The objective is configurable, so open questions ("total VP vs VP/turn", "what γ", "which reward
shaping") are settled by **measurement**.

There is intentionally **no agent SDK and no scripted search loop**. The harness is a single
tool — `run one experiment` — meant to be driven by **you or a coding agent (Claude Code /
Codex)**: run an experiment, read `runs/`, form a hypothesis, run the next one, repeat.

## Layout
```
ml/research/
  harness.py        run ONE experiment from a config → runs/<id>/{config,metrics.jsonl,summary,weights,log}
                    `--board` prints the leaderboard of past runs
  configs/          experiment configs (baseline.json, smoke.json, ...)
  runs/             one directory per run (auto-created)
```

## An experiment config
```jsonc
{
  "name": "baseline",
  "objective": { "metric": "avgVP", "opponent": "mean" },   // maximize: avgVP|vpPerTurn|winRate|avgPlace
  "cold_start": { "games_per_shard": 30, "shards": 6, "record_profile": "pvphunter", "max_rounds": 90 },
  "iterations": 3,
  "datagen": { "games_per_shard": 40, "shards": 6, "selection": "value",
               "sample": true, "temperature": 1.0, "max_rounds": 100, "seats": 4 },
  "shaping": "balanced",
  "gamma": 0.99,
  "train": { "epochs": 12, "beta": 2.0 },
  "eval": { "games": 24, "opponents": ["pvphunter","medium","mixed"], "max_rounds": 110, "selection": "hybrid" }
}
```

## Run it
```bash
ml/.venv/bin/python ml/research/harness.py --config ml/research/configs/baseline.json
ml/.venv/bin/python ml/research/harness.py --config ml/research/configs/smoke.json   # quick check
ml/.venv/bin/python ml/research/harness.py --board                                    # leaderboard
```

## How a coding agent uses this
Point Claude Code or Codex at the repo: read the configs + `shaping.ts` to learn the knobs,
write a config and run `harness.py --config <it>`, read `runs/<id>/metrics.jsonl` (or `--board`),
then change one or two knobs and repeat. The agent *is* the researcher; the harness just runs the
experiment it designs.

## Notes
- `objective` + `gamma` are first-class so "total VP vs VP/turn vs which γ" is a measurable
  experiment. Default = total `avgVP`, γ=0.99 (so late-paying economy builds aren't penalized).
- Objective metrics: `avgVP` | `vpPerTurn` | `winRate` | `avgPlace`; `opponent` = an eval field or `"mean"`.
- Each run is self-contained (clears `ml/data` + weights, cold-starts, then iterates). Runs are sequential.
