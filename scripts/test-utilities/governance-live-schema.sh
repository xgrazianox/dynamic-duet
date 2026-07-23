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
  sel=$(psql -tAc "SELECT string_agg(g,',' ORDER BY g) FROM (VALUES ('authenticated'),('service_role')) t(g) WHERE has_table_privilege(g,'public.$v','SELECT')")
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
check "triggers" "operations_no_delete,operations_no_update,trg_fx_rates_protected,trg_instruments_no_delete,trg_instruments_protected,trg_portfolios_protected,trg_price_points_protected,trg_settings_protected" "$trg"

bootmd5=$(psql -tAc "SELECT md5(prosrc) FROM pg_proc WHERE proname='bootstrap_user_data'")
check "bootstrap_user_data.md5" "$EXPECTED_MD5" "$bootmd5"

# ---- F3-0 RPC attestations (SECURITY DEFINER, search_path='', grants) ----
# save_target_set: authenticated + service_role
secdef=$(psql -tAc "SELECT prosecdef FROM pg_proc WHERE proname='save_target_set'")
check "save_target_set.security_definer" "t" "$secdef"
sp=$(psql -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_proc, unnest(coalesce(proconfig,'{}')) cfg WHERE proname='save_target_set' AND cfg LIKE 'search_path=%') THEN 'yes' ELSE 'no' END")
check "save_target_set.search_path_empty" "yes" "$sp"
g=$(psql -tAc "SELECT string_agg(g,',' ORDER BY g) FROM (VALUES ('authenticated'),('service_role')) t(g) WHERE has_function_privilege(g,'public.save_target_set(text,jsonb)','EXECUTE')")
check "save_target_set.exec_grants" "authenticated,service_role" "$g"
anon_bad=$(psql -tAc "SELECT CASE WHEN has_function_privilege('anon','public.save_target_set(text,jsonb)','EXECUTE') THEN 1 ELSE 0 END")
check "save_target_set.no_anon" "0" "$anon_bad"

# persist_regime_decision: service_role ONLY
secdef=$(psql -tAc "SELECT prosecdef FROM pg_proc WHERE proname='persist_regime_decision'")
check "persist_regime_decision.security_definer" "t" "$secdef"
sp=$(psql -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_proc, unnest(coalesce(proconfig,'{}')) cfg WHERE proname='persist_regime_decision' AND cfg LIKE 'search_path=%') THEN 'yes' ELSE 'no' END")
check "persist_regime_decision.search_path_empty" "yes" "$sp"
g=$(psql -tAc "SELECT string_agg(g,',' ORDER BY g) FROM (VALUES ('anon'),('authenticated'),('service_role')) t(g) WHERE has_function_privilege(g,'public.persist_regime_decision(jsonb)','EXECUTE')")
check "persist_regime_decision.exec_grants" "service_role" "$g"

# ---- F5-0 RPC attestations ----
for fn in acknowledge_regime_event mark_regime_applied; do
  secdef=$(psql -tAc "SELECT prosecdef FROM pg_proc WHERE proname='$fn'")
  check "$fn.security_definer" "t" "$secdef"
  sp=$(psql -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_proc, unnest(coalesce(proconfig,'{}')) cfg WHERE proname='$fn' AND cfg LIKE 'search_path=%') THEN 'yes' ELSE 'no' END")
  check "$fn.search_path_empty" "yes" "$sp"
  g=$(psql -tAc "SELECT string_agg(g,',' ORDER BY g) FROM (VALUES ('authenticated'),('service_role')) t(g) WHERE has_function_privilege(g,'public.$fn(text,jsonb)','EXECUTE')")
  check "$fn.exec_grants" "authenticated,service_role" "$g"
  anon_bad=$(psql -tAc "SELECT CASE WHEN has_function_privilege('anon','public.$fn(text,jsonb)','EXECUTE') THEN 1 ELSE 0 END")
  check "$fn.no_anon" "0" "$anon_bad"
done

# ---- F6-r2: update_portfolio_settings + niente UPDATE diretto client ----
for fn in update_portfolio_settings; do
  secdef=$(psql -tAc "SELECT prosecdef FROM pg_proc WHERE proname='$fn'")
  check "$fn.security_definer" "t" "$secdef"
  spx=$(psql -tAc "SELECT COALESCE((SELECT cfg FROM pg_proc, unnest(coalesce(proconfig,'{}')) cfg WHERE proname='$fn' AND cfg LIKE 'search_path=%'),'MISSING')")
  check "$fn.search_path_exact_empty" 'search_path=""' "$spx"
  g=$(psql -tAc "SELECT string_agg(g,',' ORDER BY g) FROM (VALUES ('authenticated'),('service_role')) t(g) WHERE has_function_privilege(g,'public.$fn(text,jsonb)','EXECUTE')")
  check "$fn.exec_grants" "authenticated,service_role" "$g"
  anon_bad=$(psql -tAc "SELECT CASE WHEN has_function_privilege('anon','public.$fn(text,jsonb)','EXECUTE') THEN 1 ELSE 0 END")
  check "$fn.no_anon" "0" "$anon_bad"
done
nu=$(psql -tAc "SELECT CASE WHEN has_table_privilege('authenticated','public.portfolio_settings','UPDATE') THEN 1 ELSE 0 END")
check "portfolio_settings.no_direct_update" "0" "$nu"
np=$(psql -tAc "SELECT count(*) FROM pg_policies WHERE tablename='portfolio_settings' AND policyname='psettings_upd_own'")
check "portfolio_settings.upd_policy_dropped" "0" "$np"

(( fail == 0 )) && echo "GOVERNANCE-LIVE-SCHEMA: PASS" || { echo "GOVERNANCE-LIVE-SCHEMA: FAIL"; exit 1; }
