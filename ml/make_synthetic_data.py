"""
Generate synthetic training data for Arc Spirits candidate scorer.

Rule: the chosen candidate is the one whose first feature is largest
      (with 80% probability; 20% random to add noise).
      ret = 0.9 if the chosen candidate actually had the largest first feature,
            0.3 otherwise (so the value head also has signal to learn).

Output:
  ml/data/synthetic_train.jsonl   (~2000 samples)
  ml/data/meta.json
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np

OBS_DIM = 48
ACT_DIM = 36
N_SAMPLES = 2000
MAX_CANDS = 6   # each sample has 1..MAX_CANDS candidates
SEED = 42


def generate(out_dir: Path, seed: int = SEED) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    random.seed(seed)

    records: list[dict] = []

    for _ in range(N_SAMPLES):
        n_cands = rng.integers(1, MAX_CANDS + 1)  # [1, MAX_CANDS]

        obs = rng.standard_normal(OBS_DIM).astype(np.float32)
        cands = rng.standard_normal((n_cands, ACT_DIM)).astype(np.float32)

        # Optimal candidate: the one with the largest first feature
        best_idx = int(np.argmax(cands[:, 0]))

        # 80% follow the rule, 20% random
        if random.random() < 0.8:
            chosen = best_idx
        else:
            chosen = random.randint(0, n_cands - 1)

        # ret: high if the chosen candidate is the "best" one
        if chosen == best_idx:
            ret = float(rng.uniform(0.7, 1.0))
        else:
            ret = float(rng.uniform(0.0, 0.4))

        records.append({
            "obs": obs.tolist(),
            "cands": cands.tolist(),
            "chosen": chosen,
            "ret": ret,
            "iter": 0,
        })

    out_file = out_dir / "synthetic_train.jsonl"
    with open(out_file, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")

    meta = {
        "obs_dim": OBS_DIM,
        "act_dim": ACT_DIM,
        "samples": N_SAMPLES,
        "games": N_SAMPLES,
    }
    with open(out_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Generated {N_SAMPLES} samples -> {out_file}")
    print(f"meta.json -> obs_dim={OBS_DIM}, act_dim={ACT_DIM}")


if __name__ == "__main__":
    generate(Path(__file__).parent / "data")
