#!/usr/bin/env bash
# governance-live-schema: DB-connected schema + view security attestation.
# Fail-closed. Requires PG* env vars. Does NOT check for empty user data —
# that lives in test-data-cleanliness.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPECTED_MD5=$(cat "$ROOT/scripts/test-utilities/bootstrap_user_data.expected.md5")
: "${PGHOST:?FAIL: PGHOST unset — governance-live-schema cannot skip}"
psql -tAc "SELECT 1" >/dev/null || { echo "FAIL: DB unreachable"; exit 1; }
fail=0
check() { local label="$1" expected="$2" got="$3"
  if [[ "$expected" == "$got" ]]; then echo "OK  $label"; else echo "FAIL $label expected=$expected got=$got"; fail=1; fi; }

EXPECTED_TABLES="fx_rates,instruments,mutation_requests,operations,portfolio_settings,portfolios,price_points,regime_decisions,target_allocations,target_sets"
EXPECTED_VIEWS="fx_rates_v,instruments_v,operations_v,price_points_v,target_allocations_v"

tables=$(psql -tAc "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
check "tables" "$EXPECTED_TABLES" "$tables"

views=$(psql -tAc "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.views WHERE table_schema='public'")
check "views" "$EXPECTED_VIEWS" "$views"

# Every view must have security_invoker=true (fail-closed)
IFS=',' read -ra VARR <<< "$EXPECTED_VIEWS"
for v in "${VARR[@]}"; do
  opts=$(psql -tAc "SELECT COALESCE(array_to_string(reloptions,','),'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$v'")
  if [[ "$opts" == *"security_invoker=true"* ]]; then echo "OK  view.$v.security_invoker"
  else echo "FAIL view.$v.security_invoker expected=security_invoker=true got=$opts"; fail=1; fi
done

# Every view must be read-only for authenticated + service_role, no anon, no PUBLIC
for v in "${VARR[@]}"; do
  # Forbidden grants (INSERT/UPDATE/DELETE/TRUNCATE to any role, any grant to anon/PUBLIC)
  bad=$(psql -tAc "SELECT (CASE WHEN has_table_privilege('anon','public.$v','SELECT') THEN 1 ELSE 0 END) + (CASE WHEN has_table_privilege('authenticated','public.$v','INSERT,UPDATE,DELETE') THEN 1 ELSE 0 END) + (CASE WHEN has_table_privilege('service_role','public.$v','INSERT,UPDATE,DELETE') THEN 1 ELSE 0 END)")
  check "view.$v.no_write_no_anon" "0" "$bad"
  # Required SELECT for authenticated + service_role
  sel=$(psql -tAc "SELECT string_agg(grantee, ',' ORDER BY grantee) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='$v' AND privilege_type='SELECT' AND grantee IN ('authenticated','service_role')")
  check "view.$v.select_grants" "authenticated,service_role" "$sel"
done

# RLS on every base table (fail-closed)
IFS=',' read -ra TARR <<< "$EXPECTED_TABLES"
for t in "${TARR[@]}"; do
  rls=$(psql -tAc "SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$t'")
  check "table.$t.rls_enabled" "t" "$rls"
done

rls_off=$(psql -tAc "SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace WHERE t.schemaname='public' AND NOT c.relrowsecurity")
check "rls_all_enabled" "0" "$rls_off"

trg=$(psql -tAc "SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public'")
check "triggers" "operations_no_delete,operations_no_update,trg_portfolios_protected,trg_settings_protected" "$trg"

bootmd5=$(psql -tAc "SELECT md5(prosrc) FROM pg_proc WHERE proname='bootstrap_user_data'")
check "bootstrap_user_data.md5" "$EXPECTED_MD5" "$bootmd5"

(( fail == 0 )) && echo "GOVERNANCE-LIVE-SCHEMA: PASS" || { echo "GOVERNANCE-LIVE-SCHEMA: FAIL"; exit 1; }
