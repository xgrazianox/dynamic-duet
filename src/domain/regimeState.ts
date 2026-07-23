/** F5 — Semantica del regime: TRE concetti separati (sez. 2 del mandato).
 *  - applicabile: final_regime dell'ultima decisione DETERMINATA
 *    (as_of_month DESC, decided_at DESC); una UNDETERMINED successiva non la cancella.
 *  - evento switch: decisione con is_switch=true e acknowledged_at NULL.
 *  - applicato: portfolio_settings.last_applied_regime (solo mark_regime_applied lo cambia).
 */
export type RegimeValue = 'RISK_ON' | 'RISK_OFF';

export interface RegimeDecisionInput {
  id: string;
  as_of_month: string;               // YYYY-MM-DD
  decided_at: string;                // ISO
  final_regime: RegimeValue | null;  // null = UNDETERMINED
  is_switch: boolean;
  acknowledged_at: string | null;
}

export interface RegimeState {
  latestDecision: RegimeDecisionInput | null;      // ultima in assoluto (anche UNDETERMINED)
  latestDetermined: RegimeDecisionInput | null;    // ultima con final_regime NOT NULL
  applicableRegime: RegimeValue | null;
  lastAppliedRegime: RegimeValue | null;
  /** applicabile presente e ≠ applicato (NULL applicato ⇒ prima adozione). */
  migrationNeeded: boolean;
  /** true SOLO nel caso applicato=NULL con applicabile presente. */
  isFirstAdoption: boolean;
  unacknowledgedSwitches: RegimeDecisionInput[];
}

function byRecency(a: RegimeDecisionInput, b: RegimeDecisionInput): number {
  if (a.as_of_month !== b.as_of_month) return a.as_of_month < b.as_of_month ? 1 : -1;
  if (a.decided_at !== b.decided_at) return a.decided_at < b.decided_at ? 1 : -1;
  return 0;
}

export function computeRegimeState(
  decisions: RegimeDecisionInput[],
  lastAppliedRegime: RegimeValue | null,
): RegimeState {
  const sorted = [...decisions].sort(byRecency);
  const latestDecision = sorted[0] ?? null;
  const latestDetermined = sorted.find(d => d.final_regime !== null) ?? null;
  const applicableRegime = latestDetermined?.final_regime ?? null;
  const migrationNeeded = applicableRegime !== null && applicableRegime !== lastAppliedRegime;
  const isFirstAdoption = applicableRegime !== null && lastAppliedRegime === null;
  const unacknowledgedSwitches = sorted.filter(d => d.is_switch && d.acknowledged_at === null);
  return {
    latestDecision, latestDetermined, applicableRegime, lastAppliedRegime,
    migrationNeeded, isFirstAdoption, unacknowledgedSwitches,
  };
}
