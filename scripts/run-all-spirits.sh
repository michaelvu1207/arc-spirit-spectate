#!/usr/bin/env bash
# Run the per-spirit awaken+ability e2e for every spirit in scripts/spirits.txt,
# sequentially (one browser at a time → no congestion). Writes a compact line per
# spirit to /tmp/e2e-all.txt and a final SUMMARY.
set -u
cd "$(dirname "$0")/.."
BASE="${BASE_URL:-http://localhost:5175}"
OUT=/tmp/e2e-all.txt
: > "$OUT"

pass=0; fail=0
while IFS='|' read -r id name; do
  [ -z "$id" ] && continue
  raw=$(BASE_URL="$BASE" node scripts/e2e-spirit.mjs "$id" "$name" 2>/dev/null | grep '^RESULT ')
  if ! echo "$raw" | grep -q '"ok":true'; then
    # one retry for any transient hiccup
    sleep 2
    raw=$(BASE_URL="$BASE" node scripts/e2e-spirit.mjs "$id" "$name" 2>/dev/null | grep '^RESULT ')
  fi
  line=$(echo "$raw" | python3 -c "
import sys,json
s=sys.stdin.read()[7:].strip()
try:
    r=json.loads(s)
    print(f\"{('PASS' if r['ok'] else 'FAIL')}  {r['spiritName']:20}  offered={r['offered']} awakened={r['awakened']} ability={r['abilityKind']} errs={len(r['consoleErrors'])} {(r['error'] or '')[:80]}\")
except Exception as e:
    print('FAIL  (no RESULT) '+str(e))
" 2>/dev/null)
  [ -z "$line" ] && line="FAIL  $name  (no RESULT line)"
  echo "$line" | tee -a "$OUT"
  case "$line" in PASS*) pass=$((pass+1));; *) fail=$((fail+1));; esac
done < scripts/spirits.txt

echo "SUMMARY: $pass passed, $fail failed" | tee -a "$OUT"
