import { callRpc } from './rpcClient';

/** F6-r2 — le impostazioni si modificano SOLO via update_portfolio_settings. */
export interface EngineConfigPayload {
  decision_mode: 'USE_A' | 'USE_B' | 'A_AND_B' | 'A_OR_B' | 'A_PRIORITY';
  signalA: { smaMonths: number; bandPct: number; confirmMonths: number };
  signalB: {
    b1SmaMonths: number; b1BandPct: number; b2SmaMonths: number; b2BandPct: number;
    b3VolLookback: number; b3VolThreshold: number; minVotesRequired: number; confirmMonths: number;
  };
}
export interface SettingsPayload {
  tolerance_pp?: number;
  rounding_eur?: number;
  min_trade_eur?: number;
  take_profit_pct?: number;
  stale_price_days?: number;
  simulated_fee_eur?: number;
  default_fx?: Partial<Record<'USD' | 'CHF', number>>;
  msci_instrument_id?: string;
  gold_instrument_id?: string;
  engine_config?: EngineConfigPayload;
}
export interface SettingsResult { updated: boolean; noop: boolean; fields?: string[] }

/** La chiave è ESPLICITA e per-tentativo (createAttemptTracker): mai derivata
 *  dal contenuto — una chiave permanente per contenuto rigiocherebbe risultati
 *  cached dopo A→B→A. */
export async function updatePortfolioSettings(key: string, payload: SettingsPayload): Promise<SettingsResult> {
  return callRpc<SettingsResult>('update_portfolio_settings', key, payload);
}
