#!/usr/bin/env bash
# governance-live-schema: DB-connected schema attestation. Fail-closed.
# Requires PGHOST/PGUSER/PGPASSWORD/PGDATABASE (auth schema readable) OR skip with exit=2.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPECTED_MD5=$(cat "$ROOT/scripts/test-utilities/bootstrap_user_data.expected.md5")
: "${PGHOST:?FAIL: PGHOST unset — governance-live-schema cannot skip}"
psql -tAc "SELECT 1" >/dev/null || { echo "FAIL: DB unreachable"; exit 1; }
fail=0
check() { local label="$1" expected="$2" got="$3"
  if [[ "$expected" == "$got" ]]; then echo "OK  $label"; else echo "FAIL $label expected=$expected got=$got"; fail=1; fi; }
tables=$(psql -tAc "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
check "tables" "fx_rates,instruments,mutation_requests,operations,portfolio_settings,portfolios,price_points,regime_decisions,target_allocations,target_sets" "$tables"
views=$(psql -tAc "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.views WHERE table_schema='public'")
check "views" "fx_rates_v,instruments_v,operations_v,price_points_v,target_allocations_v" "$views"
rls_off=$(psql -tAc "SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename AND c.relnamespace='public'::regnamespace WHERE t.schemaname='public' AND NOT c.relrowsecurity")
check "rls_all_enabled" "0" "$rls_off"
trg=$(psql -tAc "SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public'")
check "triggers" "operations_no_delete,operations_no_update,trg_portfolios_protected,trg_settings_protected" "$trg"
bootmd5=$(psql -tAc "SELECT md5(prosrc) FROM pg_proc WHERE proname='bootstrap_user_data'")
check "bootstrap_user_data.md5" "$EXPECTED_MD5" "$bootmd5"
fixtures=$(psql -tAc "SELECT (SELECT count(*) FROM public.operations)+(SELECT count(*) FROM public.price_points)+(SELECT count(*) FROM public.fx_rates)")
check "financial_fixtures_absent" "0" "$fixtures"
(( fail == 0 )) && echo "GOVERNANCE-LIVE-SCHEMA: PASS" || { echo "GOVERNANCE-LIVE-SCHEMA: FAIL"; exit 1; }
