#!/usr/bin/env bash
# test-data-cleanliness: to run ONLY when the DB is declared empty (fresh env,
# post-teardown E2E). Verifies no financial fixtures leaked.
set -euo pipefail
: "${PGHOST:?FAIL: PGHOST unset}"
fixtures=$(psql -tAc "SELECT (SELECT count(*) FROM public.operations)+(SELECT count(*) FROM public.price_points)+(SELECT count(*) FROM public.fx_rates)")
if [[ "$fixtures" == "0" ]]; then echo "TEST-DATA-CLEANLINESS: PASS (0 rows)"; exit 0
else echo "TEST-DATA-CLEANLINESS: FAIL ($fixtures financial rows present)"; exit 1; fi
