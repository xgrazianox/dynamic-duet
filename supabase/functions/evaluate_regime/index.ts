// Edge Function: evaluate_regime (F3-C2)
// Security model:
//  - JWT-first: the caller's user JWT is validated BEFORE any service-role use.
//  - Identity comes ONLY from the verified JWT; the portfolio is derived from
//    the verified user_id. A portfolio_id in the body is optional and, if
//    present, must match (else 403). Ideal call has an empty body.
//  - The service-role key is read from a secret and never logged or returned.
//  - Persistence goes exclusively through the internal RPC persist_regime_decision
//    (granted to service_role only). Below-threshold data persists nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  alignMonthlyPairs,
  evaluateRegime,
  configFromDb,
  canonicalConfigString,
  canonicalInputString,
  ENGINE_VERSION,
  type PricePoint,
} from '../_shared/engine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json(500, { error: 'server not configured' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'authentication required' });

  // 1) Validate the JWT with a user-scoped client (no service role yet)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) return json(401, { error: 'invalid or expired token' });
  const userId = userData.user.id;

  // Optional body; ideal call is empty. Any provided portfolio_id must match.
  let body: { portfolio_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // 2) Service-role client for privileged reads + the internal RPC
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: pf, error: pfErr } = await svc
    .from('portfolios').select('id').eq('user_id', userId).maybeSingle();
  if (pfErr) return json(500, { error: 'lookup failed' });
  if (!pf) return json(404, { error: 'no portfolio for user' });
  if (body.portfolio_id && body.portfolio_id !== pf.id) return json(403, { error: 'portfolio does not belong to caller' });

  const { data: settings, error: sErr } = await svc
    .from('portfolio_settings')
    .select('engine_config, msci_instrument_id, gold_instrument_id')
    .eq('portfolio_id', pf.id).maybeSingle();
  if (sErr) return json(500, { error: 'settings lookup failed' });
  if (!settings?.msci_instrument_id || !settings?.gold_instrument_id)
    return json(422, { error: 'signal drivers (MSCI/Gold) not configured' });

  const cfg = configFromDb(settings.engine_config);

  const [{ data: msciRows }, { data: goldRows }] = await Promise.all([
    svc.from('price_points').select('price_date, close_price').eq('instrument_id', settings.msci_instrument_id).order('price_date'),
    svc.from('price_points').select('price_date, close_price').eq('instrument_id', settings.gold_instrument_id).order('price_date'),
  ]);
  const toPP = (r: { price_date: string; close_price: string | number }): PricePoint =>
    ({ date: r.price_date, close: Number(r.close_price) });

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM (current, excluded)
  const pairs = alignMonthlyPairs((msciRows ?? []).map(toPP), (goldRows ?? []).map(toPP), currentMonth);
  const ev = evaluateRegime(pairs, cfg);

  // 3a) Below threshold → no decision persisted (F3 point 8)
  if (ev.dataStatus === 'insufficient') {
    return json(200, {
      data_status: 'insufficient',
      required_months: ev.requiredMonths,
      available_months: ev.availableMonths,
      engine_version: ENGINE_VERSION,
    });
  }

  // 3b) Determined or UNDETERMINED → persist via service-role RPC
  const configHash = await sha256hex(canonicalConfigString(cfg));
  const inputFingerprint = await sha256hex(canonicalInputString(ev.pairs));
  const finalRegime = ev.finalRegime === 'UNDETERMINED' ? null : ev.finalRegime;
  const regimeA = ev.regimeA === 'UNDETERMINED' ? null : ev.regimeA;
  const regimeB = ev.regimeB === 'UNDETERMINED' ? null : ev.regimeB;

  const { data: persisted, error: rpcErr } = await svc.rpc('persist_regime_decision', {
    _payload: {
      actor_user_id: userId,
      portfolio_id: pf.id,
      as_of_month: ev.asOfMonth,
      regime_a: regimeA,
      regime_b: regimeB,
      final_regime: finalRegime,
      decision_mode: cfg.decision.mode,
      config: settings.engine_config,
      config_hash: configHash,
      input_fingerprint: inputFingerprint,
      engine_version: ENGINE_VERSION,
    },
  });
  if (rpcErr) return json(500, { error: 'could not persist decision' }); // generic: no secrets/details

  return json(200, {
    data_status: ev.dataStatus,       // 'determined' | 'undetermined'
    as_of_month: ev.asOfMonth,
    final_regime: finalRegime,
    regime_a: regimeA,
    regime_b: regimeB,
    engine_version: ENGINE_VERSION,
    ...persisted,
  });
});
