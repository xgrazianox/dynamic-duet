#!/usr/bin/env bash
# Deterministically emit the Deno Edge engine artifact from the canonical source.
# Canonical source of truth: src/domain/signalEngine.ts (imported by the React app).
# The Edge Function imports ONLY the generated artifact supabase/functions/_shared/engine.ts.
# Regenerate the file:  bash scripts/generate-edge-engine.sh > supabase/functions/_shared/engine.ts
# Verified byte-for-byte by scripts/test-utilities/engine-single-source.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/domain/signalEngine.ts"
[[ -f "$SRC" ]] || { echo "generate-edge-engine: missing $SRC" >&2; exit 1; }
printf '%s\n' '// GENERATED FILE — DO NOT EDIT.'
printf '%s\n' '// Source of truth: src/domain/signalEngine.ts (imported by the React app).'
printf '%s\n' '// Regenerate: bash scripts/generate-edge-engine.sh > supabase/functions/_shared/engine.ts'
printf '%s\n' '// Verified by scripts/test-utilities/engine-single-source.sh (fails on any divergence).'
cat "$SRC"
