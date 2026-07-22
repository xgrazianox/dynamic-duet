#!/usr/bin/env bash
# CI guard for migration governance (F1 closure).
# Fails when:
#  1) any file in the allowlist has been modified (rewrite of applied history);
#  2) any NEW migration (not in the allowlist) contains forbidden statements:
#     - DISABLE TRIGGER on public.operations
#     - DELETE on auth.users
#     - DELETE ... WHERE ... ILIKE pattern on user data
#  3) (optional, when DB reachable) bootstrap_user_data source md5 differs from
#     scripts/test-utilities/bootstrap_user_data.expected.md5.
#  4) (optional, when DB reachable) auth.users count decreased after a replay:
#     the caller passes AUTH_USERS_PRE as env var; the script re-reads current
#     count and fails if it dropped (defense against migrations
#     20260722014743/54 replay).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$ROOT/scripts/test-utilities/nonconformant-migrations.allowlist"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

echo "== (1) verify allowlist hashes =="
# Portable: read pairs, compute sha256, compare.
fail=0
while read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  expected=$(echo "$line" | awk '{print $1}')
  path=$(echo "$line" | awk '{print $2}')
  if [[ ! -f "$ROOT/$path" ]]; then
    echo "MISSING: $path"; fail=1; continue
  fi
  actual=$(sha256sum "$ROOT/$path" | awk '{print $1}')
  if [[ "$actual" != "$expected" ]]; then
    echo "HASH MISMATCH: $path"
    echo "  expected=$expected"
    echo "  actual  =$actual"
    fail=1
  fi
done < "$ALLOWLIST"

echo "== (2) forbid new migrations with dangerous statements =="
allowed_files=$(awk '/^[a-f0-9]/ {print $2}' "$ALLOWLIST" | xargs -n1 basename)
for f in "$MIGRATIONS_DIR"/*.sql; do
  base=$(basename "$f")
  if echo "$allowed_files" | grep -qx "$base"; then continue; fi
  if grep -Ei 'DISABLE[[:space:]]+TRIGGER' "$f" >/dev/null; then
    echo "FORBIDDEN (DISABLE TRIGGER): $base"; fail=1
  fi
  if grep -Ei 'DELETE[[:space:]]+FROM[[:space:]]+auth\.users' "$f" >/dev/null; then
    echo "FORBIDDEN (DELETE auth.users): $base"; fail=1
  fi
  if grep -Ei 'DELETE[[:space:]]+FROM[[:space:]]+auth\.users.*ILIKE' "$f" >/dev/null; then
    echo "FORBIDDEN (ILIKE pattern user delete): $base"; fail=1
  fi
done

echo "== (3) verify bootstrap_user_data version (if DB reachable) =="
if [[ -n "${PGHOST:-}" ]]; then
  expected_md5=$(cat "$ROOT/scripts/test-utilities/bootstrap_user_data.expected.md5")
  actual_md5=$(psql -tAc "SELECT md5(prosrc) FROM pg_proc WHERE proname='bootstrap_user_data'")
  if [[ "$actual_md5" != "$expected_md5" ]]; then
    echo "BOOTSTRAP DRIFT: expected=$expected_md5 actual=$actual_md5"
    fail=1
  fi
else
  echo "  (skipped: no PGHOST)"
fi

echo "== (4) verify auth.users count did not decrease (replay guard) =="
if [[ -n "${PGHOST:-}" && -n "${AUTH_USERS_PRE:-}" ]]; then
  post=$(psql -tAc "SELECT count(*) FROM auth.users")
  if (( post < AUTH_USERS_PRE )); then
    echo "AUTH USERS DROPPED: pre=$AUTH_USERS_PRE post=$post"
    fail=1
  else
    echo "  ok: pre=$AUTH_USERS_PRE post=$post"
  fi
else
  echo "  (skipped: need PGHOST and AUTH_USERS_PRE)"
fi

if (( fail != 0 )); then
  echo "MIGRATION GOVERNANCE CHECK: FAIL"
  exit 1
fi
echo "MIGRATION GOVERNANCE CHECK: PASS"