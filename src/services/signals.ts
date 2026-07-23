import { supabase } from '@/integrations/supabase/client';

/** Chiama la Edge Function evaluate_regime. L'identità arriva dal JWT utente
 * (allegato automaticamente da supabase.functions.invoke). Nessuna mutazione
 * avviene lato client: la decisione è persistita SOLO dalla Edge Function. */
export interface EvaluateRegimeResult {
  data_status: 'insufficient' | 'undetermined' | 'determined';
  as_of_month?: string | null;
  final_regime?: 'RISK_ON' | 'RISK_OFF' | null;
  regime_a?: 'RISK_ON' | 'RISK_OFF' | null;
  regime_b?: 'RISK_ON' | 'RISK_OFF' | null;
  required_months?: number;
  available_months?: number;
  engine_version?: string;
  is_switch?: boolean;
  idempotent?: boolean;
}

export async function evaluateRegimeRemote(): Promise<EvaluateRegimeResult> {
  const { data, error } = await supabase.functions.invoke('evaluate_regime', { body: {} });
  if (error) throw error;
  return data as EvaluateRegimeResult;
}
