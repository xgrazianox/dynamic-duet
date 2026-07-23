import { supabase } from '@/integrations/supabase/client';

/** Wrapper sulla RPC autoritativa save_target_set (F3-0).
 * Il client invia solo (regime, rows); portafoglio, versione, effective_from,
 * hash e supersede sono responsabilità del server. */
export type TargetRegime = 'RISK_ON' | 'RISK_OFF';
export interface TargetRow {
  instrument_id: string | null; // null = riga Cash
  weight: number;               // percentuale (0..100)
}
export interface SaveTargetOk {
  target_set_id: string;
  regime: TargetRegime;
  version: number;
  effective_from: string;
}

export function newTargetKey(): string {
  return `tgt:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

export async function saveTargetSet(
  key: string, regime: TargetRegime, rows: TargetRow[],
): Promise<SaveTargetOk> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('save_target_set', {
    _key: key,
    _payload: { regime, rows },
  });
  if (error) throw error;
  return data as SaveTargetOk;
}
