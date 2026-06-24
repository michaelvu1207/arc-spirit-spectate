# Arc Spirits ML Training Stack

Candidate-scoring policy + value network trained by offline imitation / advantage-weighted regression (AWR) on self-play data produced by the TypeScript game engine.

## Architecture

- **Trunk (candidate scorer):** `concat(obs, cand_feat)` → Linear(in, 128) → ReLU → Linear(128, 128) → ReLU → Linear(128, 1). One scalar logit per candidate; softmax over valid candidates = policy.
- **Value head:** `obs` → Linear(obs_dim, 64) → ReLU → Linear(64, 1). Predicts terminal return for the acting seat.
- **Device:** MPS (Apple Silicon) if available, else CPU. float32 throughout.

## Data contract

JSONL files in `ml/data/*.jsonl`, one decision per line:

```json
{"obs": [floats], "cands": [[floats],...], "chosen": 2, "ret": 0.66, "iter": 0}
```

- `obs`: fixed-length state vector (length `obs_dim`)
- `cands`: variable number of candidate-action vectors (each length `act_dim`)
- `chosen`: index into `cands` of the taken action
- `ret`: terminal return for the acting seat, float in [0, 1]

Plus `ml/data/meta.json`:
```json
{"obs_dim": N, "act_dim": M, "samples": ..., "games": ...}
```

## Commands

### 1. Generate synthetic data (for testing without real game data)

```bash
ml/.venv/bin/python ml/make_synthetic_data.py
```

Writes `ml/data/synthetic_train.jsonl` and `ml/data/meta.json` (OBS_DIM=48, ACT_DIM=36, 2000 samples). The learnable rule is: the chosen candidate tends to be the one with the largest first feature, and `ret` is high when that rule is followed.

### 2. Train

```bash
ml/.venv/bin/python ml/train.py \
    --data ml/data \
    --out ml/weights/policy.json \
    --epochs 8 \
    --beta 1.0
```

| Flag | Default | Description |
|------|---------|-------------|
| `--data` | `ml/data` | Directory containing `*.jsonl` files |
| `--out` | `ml/weights/policy.json` | Output JSON path |
| `--epochs` | `8` | Training epochs |
| `--beta` | `1.0` | AWR temperature. `0` = plain behavior cloning |
| `--batch-size` | `256` | Mini-batch size |
| `--lr` | `1e-3` | Adam learning rate |

Prints per-epoch: `policy_loss`, `value_loss`, `top1_acc` (fraction of decisions where argmax logit == chosen).

### 3. Verify export round-trip

```bash
ml/.venv/bin/python ml/verify_export.py \
    --weights ml/weights/policy.json \
    --data ml/data
```

Re-implements the forward pass in pure numpy (mirroring the TypeScript consumer) and asserts max absolute difference < 1e-4 versus the PyTorch forward pass. Prints `PASS` or `FAIL`.

### 4. Full self-test (one command)

```bash
ml/.venv/bin/python ml/make_synthetic_data.py && \
ml/.venv/bin/python ml/train.py --data ml/data --out ml/weights/policy.json --epochs 8 --beta 1.0 && \
ml/.venv/bin/python ml/verify_export.py --weights ml/weights/policy.json --data ml/data
```

Expected: final `top1_acc` clearly above random (>70% on synthetic rule), export `PASS`.

## Weight export format

`ml/weights/policy.json` is consumed by the TypeScript forward pass:

```json
{
  "format": "arc-cand-scorer-v1",
  "obs_dim": 48,
  "act_dim": 36,
  "trunk": [
    {"W": [[...]], "b": [...]},
    {"W": [[...]], "b": [...]},
    {"W": [[...]], "b": [...]}
  ],
  "trunk_hidden": [128, 128],
  "value": [
    {"W": [[...]], "b": [...]},
    {"W": [[...]], "b": [...]}
  ]
}
```

`W` is always `out_features × in_features` (row-major). TypeScript computes `y[o] = b[o] + Σ W[o][i] * x[i]`. ReLU is applied between layers; no activation after the final layer.

## Files

| File | Purpose |
|------|---------|
| `ml/model.py` | `CandidateScorer` nn.Module; `build_model()`, `load_dims_from_meta()` |
| `ml/train.py` | Training loop, AWR weighting, weight export |
| `ml/verify_export.py` | Numpy round-trip check against PyTorch |
| `ml/make_synthetic_data.py` | Synthetic JSONL + meta.json generator |
| `ml/requirements.txt` | `torch`, `numpy` |
| `ml/data/` | JSONL training data (real data written here by TS engine) |
| `ml/weights/policy.json` | Exported weights (consumed by TS bot) |
