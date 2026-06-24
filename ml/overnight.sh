#!/usr/bin/env bash
# Coherent AWR self-play: explore (value+sampling, reaches Fallen) → hard AWR (beta=4, winners
# only) → distill into the policy → eval the deployable HYBRID (policy positioning + PvP/VP
# overrides). Keeps champion-BC data as a prior; accumulates self-play. Saves per-iter weights+eval.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
ITERS="${ITERS:-6}"
BEST=0
for it in $(seq 1 "$ITERS"); do
  echo "=== ITER $it $(date +%H:%M:%S): explore (value+sampling) ==="
  GEN_MAXROUNDS=100 GEN_SEATS=4 GEN_SELECTION=value GEN_SAMPLE=1 ./ml/run_gen.sh neural 40 6 "x${it}" 2>&1 | grep -E "neuralWinRate" | tail -2 || true
  echo "=== ITER $it: AWR train (beta=4, winners) ==="
  EPOCHS=12 BETA=4.0 ./ml/train.sh 2>&1 | grep -E "Epoch 12|Loaded|PASS" || true
  cp ml/weights/policy.json "ml/weights/policy_x${it}.json"
  echo "=== ITER $it: eval HYBRID (deployable) vs pvphunter,medium,mixed ==="
  EVAL=1 EVAL_GAMES=24 EVAL_OPPONENTS=pvphunter,medium,mixed EVAL_MAXROUNDS=100 EVAL_SELECTION=hybrid \
    npx vitest run src/lib/play/ml/_eval.test.ts --disable-console-intercept 2>&1 | grep "\[eval\] neural" || true
  cp ml/eval_result.json "ml/eval_x${it}.json" 2>/dev/null || true
done
echo "OVERNIGHT2_DONE $(date +%H:%M:%S)"
