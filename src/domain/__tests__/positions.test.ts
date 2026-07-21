import { describe, it, expect } from 'vitest';
import { computePortfolioState } from '../computePortfolioState';
import type { LedgerRow } from '../types';

let seq = 0;
function op(partial: Partial<LedgerRow> & Pick<LedgerRow, 'op_type' | 'effective_date'>): LedgerRow {
  seq += 1;
  return {
    id: partial.id ?? `op-${seq}`,
    portfolio_id: 'p1',
    op_type: partial.op_type,
    effective_date: partial.effective_date,
    recorded_at: partial.recorded_at ?? `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    seq: partial.seq ?? seq,
    instrument_id: partial.instrument_id ?? null,
    quantity: partial.quantity ?? null,
    gross_amount_eur: partial.gross_amount_eur ?? null,
    fees_eur: partial.fees_eur ?? 0,
    opening_cost_eur: partial.opening_cost_eur ?? null,
    reversal_of_operation_id: partial.reversal_of_operation_id ?? null,
    currency: partial.currency ?? null,
    price_ccy: partial.price_ccy ?? null,
    fx_eur_per_unit: partial.fx_eur_per_unit ?? null,
  };
}

const empty = { instruments: [], prices: [], fxRates: [] };

describe('T1 numerico', () => {
  it('DEPOSIT 10.000 + BUY 10@100 fee 5 → cash 8.995, costo 1.005, CM 100,50', () => {
    const ops: LedgerRow[] = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: 10000 }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1',
        quantity: 10, gross_amount_eur: 1000, fees_eur: 5 }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.cash.cashEur.toFixed(2)).toBe('8995.00');
    const p = s.positions.get('i1')!;
    expect(p.quantity.toString()).toBe('10');
    expect(p.totalCostEur.toFixed(2)).toBe('1005.00');
    expect(p.averageCostEur.toFixed(2)).toBe('100.50');
  });
});

describe('matrice contabile', () => {
  it('OPENING_POSITION: CM = opening_cost/qty, cash invariato', () => {
    const ops = [op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
      instrument_id: 'i1', quantity: 100, opening_cost_eur: 920, gross_amount_eur: 920 })];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.positions.get('i1')!.averageCostEur.toFixed(2)).toBe('9.20');
    expect(s.cash.cashEur.toFixed(2)).toBe('0.00');
  });

  it('DIVIDEND/OTHER_INCOME/FEE/WITHDRAW muovono cash correttamente', () => {
    const ops = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: 1000 }),
      op({ op_type: 'DIVIDEND', effective_date: '2026-01-02', instrument_id: 'i1', gross_amount_eur: 50 }),
      op({ op_type: 'OTHER_INCOME', effective_date: '2026-01-03', gross_amount_eur: 25 }),
      op({ op_type: 'FEE', effective_date: '2026-01-04', gross_amount_eur: 10 }),
      op({ op_type: 'WITHDRAW', effective_date: '2026-01-05', gross_amount_eur: 100 }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.cash.cashEur.toFixed(2)).toBe('965.00');
    expect(s.cash.incomeEur.toFixed(2)).toBe('75.00');
    expect(s.cash.feesEur.toFixed(2)).toBe('10.00');
  });
});

describe('REVERSAL neutralization', () => {
  it('stornare il BUY ripristina lo stato al centesimo', () => {
    const pre = [op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: 10000 })];
    const preS = computePortfolioState({ operations: pre, ...empty });
    const withRev: LedgerRow[] = [
      ...pre,
      op({ id: 'buy-x', op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1',
        quantity: 10, gross_amount_eur: 1000, fees_eur: 5 }),
      op({ op_type: 'REVERSAL', effective_date: '2026-01-02', reversal_of_operation_id: 'buy-x' }),
    ];
    const after = computePortfolioState({ operations: withRev, ...empty });
    expect(after.cash.cashEur.toFixed(2)).toBe(preS.cash.cashEur.toFixed(2));
    expect(after.positions.get('i1')).toBeUndefined();
  });
});

describe('vendita totale e riacquisto', () => {
  it('SELL totale azzera, nuovo BUY imposta CM nuovo, realized P&L accumulato', () => {
    const ops = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: 10000 }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1', quantity: 10, gross_amount_eur: 1000 }),
      op({ op_type: 'SELL', effective_date: '2026-01-03', instrument_id: 'i1', quantity: 10, gross_amount_eur: 1500 }),
      op({ op_type: 'BUY', effective_date: '2026-01-04', instrument_id: 'i1', quantity: 5, gross_amount_eur: 600 }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    const p = s.positions.get('i1')!;
    expect(p.quantity.toString()).toBe('5');
    expect(p.averageCostEur.toFixed(2)).toBe('120.00');
    expect(p.realizedPnlEur.toFixed(2)).toBe('500.00');
    expect(s.cash.cashEur.toFixed(2)).toBe('9900.00');
  });
});

describe('ordinamento canonico con retrodatate', () => {
  it('la retrodatata viene applicata prima', () => {
    const ops = [
      op({ op_type: 'BUY', effective_date: '2026-02-01', instrument_id: 'i1',
        recorded_at: '2026-02-01T10:00:00Z', quantity: 1, gross_amount_eur: 200 }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: 500,
        recorded_at: '2026-02-02T10:00:00Z' }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.cash.cashEur.toFixed(2)).toBe('300.00');
  });
});

describe('precisione Decimal', () => {
  it('0.1 + 0.2 = 0.30 esatto', () => {
    const ops = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '0.1' }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-02', gross_amount_eur: '0.2' }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.cash.cashEur.toFixed(2)).toBe('0.30');
    expect(s.cash.cashEur.constructor.name).toBe('Decimal');
  });
});

describe('valuazione con prezzi e asOf', () => {
  it("usa l'ultimo prezzo ≤ asOf", () => {
    const ops = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: 10000 }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1',
        quantity: 10, gross_amount_eur: 1000 }),
    ];
    const prices = [
      { instrument_id: 'i1', price_date: '2026-01-31', close_price: 110 },
      { instrument_id: 'i1', price_date: '2026-02-28', close_price: 130 },
    ];
    const s = computePortfolioState({ operations: ops, instruments: [], prices, fxRates: [], asOf: '2026-02-01' });
    const v = s.valuations[0];
    expect(v.marketValueEur.toFixed(2)).toBe('1100.00');
    expect(v.unrealizedPnlEur.toFixed(2)).toBe('100.00');
    expect(s.totals.totalValueEur.toFixed(2)).toBe('10100.00');
  });
});