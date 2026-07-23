#!/usr/bin/env bash
# Fail-closed: the committed Edge artifact must equal a fresh regeneration from the
# canonical source. Catches BOTH a stale artifact and any manual edit to either file.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/supabase/functions/_shared/engine.ts"
[[ -f "$OUT" ]] || { echo "ENGINE-SINGLE-SOURCE: FAIL — missing $OUT"; exit 1; }
if diff -q <(bash "$ROOT/scripts/generate-edge-engine.sh") "$OUT" >/dev/null; then
  echo "ENGINE-SINGLE-SOURCE: PASS (edge artifact === regenerated canonical source)"
else
  echo "ENGINE-SINGLE-SOURCE: FAIL — supabase/functions/_shared/engine.ts is stale or hand-edited."
  echo "  Fix: bash scripts/generate-edge-engine.sh > supabase/functions/_shared/engine.ts"
  diff <(bash "$ROOT/scripts/generate-edge-engine.sh") "$OUT" | head -40
  exit 1
fi
