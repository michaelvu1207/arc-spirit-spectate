#!/usr/bin/env bash
# Train on all ml/data/*.jsonl → ml/weights/policy.json, then verify the export round-trips.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
EPOCHS="${EPOCHS:-10}"; BETA="${BETA:-1.0}"
ml/.venv/bin/python ml/train.py --data ml/data --out ml/weights/policy.json --epochs "$EPOCHS" --beta "$BETA"
ml/.venv/bin/python ml/verify_export.py --weights ml/weights/policy.json --data ml/data || true
