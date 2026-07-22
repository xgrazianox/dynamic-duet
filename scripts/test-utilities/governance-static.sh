#!/usr/bin/env bash
# governance-static: pure static checks (no DB). Fail-closed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$ROOT/scripts/test-utilities/nonconformant-migrations.allowlist"
MIG="$ROOT/supabase/migrations"
fail=0
[[ -f "$ALLOWLIST" ]] || { echo "FAIL: missing allowlist"; exit 2; }
[[ -d "$MIG" ]] || { echo "FAIL: missing migrations dir"; exit 2; }
echo "== (1) allowlist hashes =="
while read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  exp=$(echo "$line" | awk '{print $1}'); p=$(echo "$line" | awk '{print $2}')
  [[ -f "$ROOT/$p" ]] || { echo "MISSING $p"; fail=1; continue; }
  act=$(sha256sum "$ROOT/$p" | awk '{print $1}')
  [[ "$act" == "$exp" ]] || { echo "HASH MISMATCH $p"; fail=1; }
done < "$ALLOWLIST"
echo "== (2) forbid dangerous patterns in NEW migrations =="
allowed=$(awk '/^[a-f0-9]/ {print $2}' "$ALLOWLIST" | xargs -n1 basename)
for f in "$MIG"/*.sql; do
  b=$(basename "$f")
  echo "$allowed" | grep -qx "$b" && continue
  grep -Ei 'DISABLE[[:space:]]+TRIGGER' "$f" >/dev/null && { echo "FORBIDDEN DISABLE TRIGGER: $b"; fail=1; }
  grep -Ei 'DELETE[[:space:]]+FROM[[:space:]]+auth\.users' "$f" >/dev/null && { echo "FORBIDDEN DELETE auth.users: $b"; fail=1; }
  grep -Ei 'session_replication_role' "$f" >/dev/null && { echo "FORBIDDEN session_replication_role: $b"; fail=1; }
  grep -Ei 'TRUNCATE.*auth\.' "$f" >/dev/null && { echo "FORBIDDEN TRUNCATE auth.*: $b"; fail=1; }
done
(( fail == 0 )) && echo "GOVERNANCE-STATIC: PASS" || { echo "GOVERNANCE-STATIC: FAIL"; exit 1; }
