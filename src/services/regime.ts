import { supabase } from '@/integrations/supabase/client';

/** F5 — wrapper delle RPC di regime. Chiavi di idempotenza STABILI per
 * contenuto (decision_id): un retry/doppio click non duplica effetti. */
export interface AckResult { decision_id: string; acknowledged: boolean; already_acknowledged: boolean }
export interface MarkResult { decision_id: string; applied_regime: 'RISK_ON' | 'RISK_OFF'; already_applied: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export async function acknowledgeRegimeEvent(decisionId: string): Promise<AckResult> {
  const { data, error } = await sb.rpc('acknowledge_regime_event', {
    _key: `ack:${decisionId}`, _payload: { decision_id: decisionId },
  });
  if (error) throw error;
  return data as AckResult;
}

export async function markRegimeApplied(decisionId: string): Promise<MarkResult> {
  const { data, error } = await sb.rpc('mark_regime_applied', {
    _key: `applied:${decisionId}`, _payload: { decision_id: decisionId },
  });
  if (error) throw error;
  return data as MarkResult;
}
