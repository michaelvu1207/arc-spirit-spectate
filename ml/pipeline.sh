#!/usr/bin/env bash
# Full iterated pipeline: train on cold data → eval → (neural self-play gen → retrain → eval) x ITERS.
# Assumes cold-start data already exists in ml/data (run ml/run_gen.sh heur ... first).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
ITERS="${ITERS:-2}"; GEN_PER="${GEN_PER:-50}"; SHARDS="${SHARDS:-6}"
EVAL_GAMES="${EVAL_GAMES:-40}"; EVAL_OPPONENTS="${EVAL_OPPONENTS:-pvphunter,medium,mixed}"

run_eval () {
  local tag="$1"
  EVAL=1 EVAL_GAMES="$EVAL_GAMES" EVAL_OPPONENTS="$EVAL_OPPONENTS" \
    npx vitest run src/lib/play/ml/_eval.test.ts --disable-console-intercept 2>&1 | grep -E "\[eval\]" || true
  cp ml/eval_result.json "ml/eval_${tag}.json" 2>/dev/null || true
}

echo "=== TRAIN (cold-start BC/AWR) ==="
EPOCHS="${EPOCHS:-12}" BETA="${BETA:-1.0}" ./ml/train.sh
echo "=== EVAL iter0 (cold-start policy) ==="
run_eval iter0

for it in $(seq 1 "$ITERS"); do
  echo "=== ITER $it: neural self-play data gen ==="
  GEN_MAXROUNDS="${GEN_MAXROUNDS:-110}" GEN_SAMPLE=1 GEN_ITER="$it" ./ml/run_gen.sh neural "$GEN_PER" "$SHARDS" "iter${it}"
  echo "=== ITER $it: retrain on cold + all neural data ==="
  EPOCHS="${EPOCHS:-12}" BETA="${BETA:-1.0}" ./ml/train.sh
  echo "=== ITER $it: eval ==="
  run_eval "iter${it}"
done
echo "PIPELINE_DONE"
