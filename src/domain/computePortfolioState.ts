import { replayLedger } from './ledgerReplay';
import { projectPositions, type PositionState, type CashState } from './positions';
import { valuePositions, totals, type PositionValuation, type PortfolioTotals } from './pnl';
import type { DomainInputs } from './types';

export interface PortfolioState {
  positions: Map<string, PositionState>;
  cash: CashState;
  valuations: PositionValuation[];
  totals: PortfolioTotals;
  asOf: string | null;
}

/**
 * UNICA funzione di proiezione domain-side.
 * Nessun componente/hook deve rifare questi calcoli: usare `usePortfolioState`.
 */
export function computePortfolioState(inputs: DomainInputs): PortfolioState {
  const active = replayLedger(inputs.operations);
  const { positions, cash } = projectPositions(active);
  const valuations = valuePositions(positions, inputs.prices, inputs.instruments, inputs.fxRates, inputs.asOf);
  return {
    positions,
    cash,
    valuations,
    totals: totals(cash, valuations),
    asOf: inputs.asOf ?? null,
  };
}

export * from './types';
export * from './positions';
export * from './pnl';
export * from './ledgerReplay';