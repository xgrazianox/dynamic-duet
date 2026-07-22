import { describe, it, expect } from 'vitest';
import { totals, type PositionValuation } from '../pnl';
import type { CashState } from '../positions';
import { D, ZERO } from '../decimal';

const cash = (over: Partial<CashState> = {}): CashState => ({
  cashEur: D('1000'), realizedPnlEur: ZERO, incomeEur: ZERO, feesEur: ZERO,
  deposits: ZERO, withdrawals: ZERO, ...over,
});

const val = (over: Partial<PositionValuation>): PositionValuation => ({
  instrumentId: 'x', currency: 'EUR', quantity: D('10'),
  averageCostEur: D('100'), totalCostEur: D('1000'), realizedPnlEur: ZERO,
  status: 'valued', lastPriceNative: D('120'), lastPriceDate: '2026-07-20',
  fxEurPerUnit: D('1'), fxDate: '2026-07-20',
  marketValueEur: D('1200'), unrealizedPnlEur: D('200'), hasPrice: true, ...over,
});

describe('totals() — campi Dashboard (Blocco C)', () => {
  it('managerialPnl = realizzato + non realizzato + income − fee', () => {
    const t = totals(
      cash({ realizedPnlEur: D('116'), incomeEur: D('35'), feesEur: D('14') }),
      [val({ unrealizedPnlEur: D('117'), marketValueEur: D('720'), quantity: D('6') })],
    );
    // 116 + 117 + 35 − 14 = 254
    expect(t.managerialPnlEur?.toFixed(2)).toBe('254.00');
    expect(t.openPositionsCount).toBe(1);
    expect(t.totalValueEur?.toFixed(2)).toBe('1720.00');
  });

  it('posizione aperta senza prezzo → totale/non realizzato/gestionale = n/d, ma realizzato/income/fee restano', () => {
    const t = totals(
      cash({ realizedPnlEur: D('50'), incomeEur: D('10'), feesEur: D('3') }),
      [val({ status: 'missing_price', marketValueEur: null, unrealizedPnlEur: null, quantity: D('5') })],
    );
    expect(t.totalValueEur).toBeNull();
    expect(t.unrealizedPnlEur).toBeNull();
    expect(t.managerialPnlEur).toBeNull();       // dipende dal non realizzato
    expect(t.hasMissingValuations).toBe(true);
    expect(t.realizedPnlEur.toFixed(2)).toBe('50.00'); // sempre determinabile
    expect(t.incomeEur.toFixed(2)).toBe('10.00');
    expect(t.feesEur.toFixed(2)).toBe('3.00');
    expect(t.cashEur.toFixed(2)).toBe('1000.00');
  });

  it('posizione CHIUSA (qty 0) senza prezzo NON forza n/d sul totale', () => {
    const t = totals(
      cash(),
      [val({ quantity: ZERO, status: 'missing_price', marketValueEur: null, unrealizedPnlEur: null, realizedPnlEur: D('42'), totalCostEur: ZERO })],
    );
    expect(t.hasMissingValuations).toBe(false);
    expect(t.openPositionsCount).toBe(0);
    expect(t.totalValueEur?.toFixed(2)).toBe('1000.00'); // solo cash, nessuna posizione aperta
  });

  it('cash-only: valore totale = cash, nessuna insufficienza', () => {
    const t = totals(cash({ cashEur: D('5000') }), []);
    expect(t.totalValueEur?.toFixed(2)).toBe('5000.00');
    expect(t.openPositionsCount).toBe(0);
    expect(t.hasMissingValuations).toBe(false);
    expect(t.managerialPnlEur?.toFixed(2)).toBe('0.00');
  });
});
