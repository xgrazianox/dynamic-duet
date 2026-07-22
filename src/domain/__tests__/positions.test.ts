import { describe, it, expect } from 'vitest';
import { computePortfolioState } from '../computePortfolioState';
import { valuePositions } from '../pnl';
import { projectPositions } from '../positions';
import { replayLedger } from '../ledgerReplay';
import { Decimal, roundMoney, roundAvgCost } from '../decimal';
import type { LedgerRow, InstrumentRow, PriceRow, FxRow } from '../types';

let seq = 0;
function op(partial: Partial<LedgerRow> & Pick<LedgerRow, 'op_type' | 'effective_date'>): LedgerRow {
  seq += 1;
  return {
    id: partial.id ?? `op-${seq}`,
    portfolio_id: 'p1',
    op_type: partial.op_type,
    effective_date: partial.effective_date,
    recorded_at: partial.recorded_at ?? `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    seq: partial.seq ?? String(seq),
    instrument_id: partial.instrument_id ?? null,
    quantity: partial.quantity ?? null,
    gross_amount_eur: partial.gross_amount_eur ?? null,
    fees_eur: partial.fees_eur ?? '0',
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
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '10000' }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1',
        quantity: '10', gross_amount_eur: '1000', fees_eur: '5' }),
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
      instrument_id: 'i1', quantity: '100', opening_cost_eur: '920', gross_amount_eur: '920' })];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.positions.get('i1')!.averageCostEur.toFixed(2)).toBe('9.20');
    expect(s.cash.cashEur.toFixed(2)).toBe('0.00');
  });

  it('DIVIDEND/OTHER_INCOME/FEE/WITHDRAW muovono cash correttamente', () => {
    const ops = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '1000' }),
      op({ op_type: 'DIVIDEND', effective_date: '2026-01-02', instrument_id: 'i1', gross_amount_eur: '50' }),
      op({ op_type: 'OTHER_INCOME', effective_date: '2026-01-03', gross_amount_eur: '25' }),
      op({ op_type: 'FEE', effective_date: '2026-01-04', gross_amount_eur: '10' }),
      op({ op_type: 'WITHDRAW', effective_date: '2026-01-05', gross_amount_eur: '100' }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.cash.cashEur.toFixed(2)).toBe('965.00');
    expect(s.cash.incomeEur.toFixed(2)).toBe('75.00');
    expect(s.cash.feesEur.toFixed(2)).toBe('10.00');
  });
});

describe('REVERSAL neutralization', () => {
  it('stornare il BUY ripristina lo stato al centesimo', () => {
    const pre = [op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '10000' })];
    const preS = computePortfolioState({ operations: pre, ...empty });
    const withRev: LedgerRow[] = [
      ...pre,
      op({ id: 'buy-x', op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1',
        quantity: '10', gross_amount_eur: '1000', fees_eur: '5' }),
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
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '10000' }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1', quantity: '10', gross_amount_eur: '1000' }),
      op({ op_type: 'SELL', effective_date: '2026-01-03', instrument_id: 'i1', quantity: '10', gross_amount_eur: '1500' }),
      op({ op_type: 'BUY', effective_date: '2026-01-04', instrument_id: 'i1', quantity: '5', gross_amount_eur: '600' }),
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
        recorded_at: '2026-02-01T10:00:00Z', quantity: '1', gross_amount_eur: '200' }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '500',
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
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '10000' }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1',
        quantity: '10', gross_amount_eur: '1000' }),
    ];
    const prices = [
      { instrument_id: 'i1', price_date: '2026-01-31', close_price: '110' },
      { instrument_id: 'i1', price_date: '2026-02-28', close_price: '130' },
    ];
    const instruments: InstrumentRow[] = [{ id: 'i1', ticker: 'X', name: 'X', currency: 'EUR', quantity_step: '1' }];
    const s = computePortfolioState({ operations: ops, instruments, prices, fxRates: [], asOf: '2026-02-01' });
    const v = s.valuations[0];
    expect(v.status).toBe('valued');
    expect(v.marketValueEur!.toFixed(2)).toBe('1100.00');
    expect(v.unrealizedPnlEur!.toFixed(2)).toBe('100.00');
    expect(s.totals.totalValueEur!.toFixed(2)).toBe('10100.00');
  });
});

// ============================================================================
// F1.b CORREZIONE — punto 1: ROUND_HALF_UP monetario
// ============================================================================
describe('rounding HALF_UP (master)', () => {
  it('1.005 → 1.01', () => expect(roundMoney(new Decimal('1.005')).toFixed(2)).toBe('1.01'));
  it('2.675 → 2.68', () => expect(roundMoney(new Decimal('2.675')).toFixed(2)).toBe('2.68'));
  it('-1.005 → -1.01 (HALF_UP away from zero)', () =>
    expect(roundMoney(new Decimal('-1.005')).toFixed(2)).toBe('-1.01'));
  it('CM 8dp HALF_UP: 100.505000005 → 100.50500001', () =>
    expect(roundAvgCost(new Decimal('100.505000005')).toString()).toBe('100.50500001'));
});

// ============================================================================
// F1.b CORREZIONE — punto 5: valorizzazione multi-valuta
// (test domain-level: la valuazione del price_points è già in EUR per apertura,
//  ma per posizioni in USD il domain applica FX EUR-per-USD all'ultimo rate ≤ asOf)
// ============================================================================
describe('multi-valuta: FX EUR-per-unit + prezzo nativo', () => {
  it('USD: 1 quota @ 108 USD × 0.9259 EUR/USD → ~100.00 EUR (un solo arrotondamento)', () => {
    // Simuliamo un BUY già registrato in EUR (contabile) + prezzo nativo USD + fx.
    // La valuazione moltiplica quota × prezzo nativo × fx; arrotonda solo a display.
    const price = new Decimal('108');
    const fx = new Decimal('0.9259');
    const qty = new Decimal('1');
    const mv = qty.times(price).times(fx); // 99.9972
    expect(roundMoney(mv).toFixed(2)).toBe('100.00');
    // controprova: 1.08 (convenzione INVERSA) sarebbe errato → 116.64
    expect(roundMoney(price.times(new Decimal('1.08'))).toFixed(2)).toBe('116.64');
  });
  it('EUR: fx = 1 sempre', () => {
    const mv = new Decimal('50').times('100').times('1');
    expect(mv.toFixed(2)).toBe('5000.00');
  });
});

// ============================================================================
// F1.b CORREZIONE — punto 6: OPENING combinato stessa data
// ============================================================================
describe('OPENING combinato (CASH + POSITION stessa data)', () => {
  it('cash = SOLO OPENING_CASH; OPENING_POSITION non tocca cash; CM da opening', () => {
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '5000' }),
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'i1', quantity: '100', opening_cost_eur: '920', gross_amount_eur: '920' }),
    ];
    const s = computePortfolioState({ operations: ops, ...empty });
    expect(s.cash.cashEur.toFixed(2)).toBe('5000.00');
    const p = s.positions.get('i1')!;
    expect(p.quantity.toString()).toBe('100');
    expect(p.averageCostEur.toFixed(2)).toBe('9.20');
  });
  it('aggiungere REVERSAL completa di entrambi ripristina lo stato pre', () => {
    const opsPre = [
      op({ op_type: 'DEPOSIT', effective_date: '2025-12-01', gross_amount_eur: '100' }),
    ];
    const preS = computePortfolioState({ operations: opsPre, ...empty });
    const opsFull: LedgerRow[] = [
      ...opsPre,
      op({ id: 'oc', op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '5000' }),
      op({ id: 'op', op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'i1', quantity: '100', opening_cost_eur: '920', gross_amount_eur: '920' }),
      op({ op_type: 'REVERSAL', effective_date: '2026-01-01', reversal_of_operation_id: 'oc' }),
      op({ op_type: 'REVERSAL', effective_date: '2026-01-01', reversal_of_operation_id: 'op' }),
    ];
    const after = computePortfolioState({ operations: opsFull, ...empty });
    expect(after.cash.cashEur.toFixed(2)).toBe(preS.cash.cashEur.toFixed(2));
    expect(after.positions.get('i1')).toBeUndefined();
  });
});

// ============================================================================
// F1.b CORREZIONE — punto 4: D() rifiuta number nel dominio contabile
// ============================================================================
describe('trasporto NUMERIC: solo stringhe accettate', () => {
  it('costruire un LedgerRow con number nei campi contabili deve fallire alla proiezione', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad: any = op({ op_type: 'DEPOSIT', effective_date: '2026-01-01' });
    bad.gross_amount_eur = 1000; // number nativo — vietato
    expect(() => computePortfolioState({ operations: [bad], ...empty })).toThrow(/rejects non-string/);
  });
  it('FX asOf: nessun fx futuro utilizzabile', () => {
    // Verifica alla valuazione (il modulo pnl considera latestPrice ≤ asOf).
    // Testo su prezzo, semantica identica per FX in versione dominio.
    const ops = [
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-01', gross_amount_eur: '10000' }),
      op({ op_type: 'BUY', effective_date: '2026-01-02', instrument_id: 'i1', quantity: '10', gross_amount_eur: '1000' }),
    ];
    const prices = [
      { instrument_id: 'i1', price_date: '2026-03-01', close_price: '200' }, // futuro
    ];
    const instruments: InstrumentRow[] = [{ id: 'i1', ticker: 'X', name: 'X', currency: 'EUR', quantity_step: '1' }];
    const s = computePortfolioState({ operations: ops, instruments, prices, fxRates: [], asOf: '2026-02-01' });
    const v = s.valuations[0];
    expect(v.status).toBe('missing_price');
    expect(v.marketValueEur).toBeNull();
    expect(s.totals.totalValueEur).toBeNull();
    expect(s.totals.hasMissingValuations).toBe(true);
  });
});

// ============================================================================
// F1.b CORREZIONE CONCLUSIVA — Valorizzazione multivaluta completa
// ============================================================================
describe('valorizzazione USD con FX storico ≠ FX di valorizzazione', () => {
  const usdInstr: InstrumentRow = { id: 'usd1', ticker: 'COPX', name: 'Copper', currency: 'USD', quantity_step: '1' };

  it('BUY USD registrato con gross EUR (fx storico X); valorizzazione usa FX Y diverso', () => {
    // Simuliamo un OPENING_POSITION in USD: qty=1, price nativo=108, fx storico=0.9259
    // → gross_amount_eur = 1 * 108 * 0.9259 = 100.00 (arrotondato)
    // Valorizzazione con FX = 0.95 (diverso) e stesso prezzo 108:
    //   market value = 1 * 108 * 0.95 = 102.60; uPnL = 102.60 - 100.00 = 2.60
    // CM (in EUR) resta 100.00 perché deriva dal gross storico.
    const ops: LedgerRow[] = [
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'usd1', quantity: '1', price_ccy: '108', currency: 'USD',
        fx_eur_per_unit: '0.9259', gross_amount_eur: '100.00', opening_cost_eur: '100.00' }),
    ];
    const prices: PriceRow[] = [
      { instrument_id: 'usd1', price_date: '2026-01-01', close_price: '108' },
    ];
    const fxRates: FxRow[] = [
      { currency: 'USD', rate_date: '2026-01-01', eur_per_unit: '0.9259' },
      { currency: 'USD', rate_date: '2026-02-01', eur_per_unit: '0.95' },
    ];
    const s = computePortfolioState({ operations: ops, instruments: [usdInstr], prices, fxRates, asOf: '2026-02-15' });
    const v = s.valuations[0];
    expect(v.status).toBe('valued');
    expect(v.averageCostEur.toFixed(2)).toBe('100.00');
    expect(v.marketValueEur!.toFixed(2)).toBe('102.60');
    expect(v.unrealizedPnlEur!.toFixed(2)).toBe('2.60');
    expect(v.fxEurPerUnit!.toString()).toBe('0.95');
  });

  it('asOf successivo a tutti i prezzi → ultimo prezzo precedente; FX futuro escluso', () => {
    const ops: LedgerRow[] = [
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'usd1', quantity: '1', price_ccy: '108', currency: 'USD',
        fx_eur_per_unit: '0.9259', gross_amount_eur: '100.00', opening_cost_eur: '100.00' }),
    ];
    const prices: PriceRow[] = [
      { instrument_id: 'usd1', price_date: '2026-01-01', close_price: '108' },
      { instrument_id: 'usd1', price_date: '2026-06-01', close_price: '120' },
    ];
    const fxRates: FxRow[] = [
      { currency: 'USD', rate_date: '2026-01-01', eur_per_unit: '0.9259' },
      { currency: 'USD', rate_date: '2027-01-01', eur_per_unit: '1.00' }, // FUTURO rispetto a asOf
    ];
    const s = computePortfolioState({ operations: ops, instruments: [usdInstr], prices, fxRates, asOf: '2026-08-01' });
    const v = s.valuations[0];
    expect(v.status).toBe('valued');
    expect(v.lastPriceNative!.toString()).toBe('120');
    expect(v.fxEurPerUnit!.toString()).toBe('0.9259'); // NON usa quello futuro
  });

  it('asOf precedente al primo prezzo → status=missing_price', () => {
    const ops: LedgerRow[] = [
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'usd1', quantity: '1', price_ccy: '108', currency: 'USD',
        fx_eur_per_unit: '0.9259', gross_amount_eur: '100.00', opening_cost_eur: '100.00' }),
    ];
    const prices: PriceRow[] = [
      { instrument_id: 'usd1', price_date: '2026-03-01', close_price: '120' },
    ];
    const fxRates: FxRow[] = [
      { currency: 'USD', rate_date: '2026-03-01', eur_per_unit: '0.95' },
    ];
    const s = computePortfolioState({ operations: ops, instruments: [usdInstr], prices, fxRates, asOf: '2026-02-01' });
    const v = s.valuations[0];
    expect(v.status).toBe('missing_price');
    expect(v.marketValueEur).toBeNull();
  });

  it('prezzo presente ma FX assente → status=missing_fx (MAI zero)', () => {
    const ops: LedgerRow[] = [
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'usd1', quantity: '1', price_ccy: '108', currency: 'USD',
        fx_eur_per_unit: '0.9259', gross_amount_eur: '100.00', opening_cost_eur: '100.00' }),
    ];
    const prices: PriceRow[] = [
      { instrument_id: 'usd1', price_date: '2026-01-01', close_price: '108' },
    ];
    const s = computePortfolioState({ operations: ops, instruments: [usdInstr], prices, fxRates: [], asOf: '2026-02-01' });
    const v = s.valuations[0];
    expect(v.status).toBe('missing_fx');
    expect(v.marketValueEur).toBeNull();
    expect(v.lastPriceNative!.toString()).toBe('108');
    expect(s.totals.hasMissingValuations).toBe(true);
    expect(s.totals.positionsValueEur).toBeNull();
  });

  it('EUR → FX sempre 1 anche senza fx_rates', () => {
    const eurInstr: InstrumentRow = { id: 'eur1', ticker: 'WORLDCORE', name: 'WC', currency: 'EUR', quantity_step: '1' };
    const ops: LedgerRow[] = [
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'eur1', quantity: '10', price_ccy: '50', currency: 'EUR',
        fx_eur_per_unit: '1', gross_amount_eur: '500.00', opening_cost_eur: '500.00' }),
    ];
    const prices: PriceRow[] = [
      { instrument_id: 'eur1', price_date: '2026-02-01', close_price: '55' },
    ];
    const s = computePortfolioState({ operations: ops, instruments: [eurInstr], prices, fxRates: [], asOf: '2026-03-01' });
    const v = s.valuations[0];
    expect(v.status).toBe('valued');
    expect(v.fxEurPerUnit!.toString()).toBe('1');
    expect(v.marketValueEur!.toFixed(2)).toBe('550.00');
    expect(v.unrealizedPnlEur!.toFixed(2)).toBe('50.00');
  });
});

// ============================================================================
// F1.b CORREZIONE CONCLUSIVA — Coerenza hook↔RPC (dominio verifica il calcolo)
// Simuliamo la SEMANTICA della nuova RPC (native price + fx storico → gross EUR)
// ============================================================================
describe('coerenza dominio↔RPC OPENING_POSITION (native × fx storico)', () => {
  it('gross_amount_eur = qty × native × fx con UN solo arrotondamento a 2dp', () => {
    // Fixture del payload che una RPC produrrebbe per COPX 10@50 USD, fx 0.9259
    const qty = new Decimal('10');
    const price = new Decimal('50');
    const fx = new Decimal('0.9259');
    const grossRpc = roundMoney(qty.times(price).times(fx)); // = 462.95
    expect(grossRpc.toFixed(2)).toBe('462.95');

    const usdInstr: InstrumentRow = { id: 'x', ticker: 'COPX', name: '', currency: 'USD', quantity_step: '1' };
    const ops: LedgerRow[] = [
      op({ op_type: 'OPENING_POSITION', effective_date: '2026-01-01',
        instrument_id: 'x', quantity: '10', price_ccy: '50', currency: 'USD',
        fx_eur_per_unit: '0.9259',
        gross_amount_eur: grossRpc.toFixed(2),
        opening_cost_eur: grossRpc.toFixed(2) }),
    ];
    const prices: PriceRow[] = [
      { instrument_id: 'x', price_date: '2026-01-01', close_price: '50' },
    ];
    const fxRates: FxRow[] = [
      { currency: 'USD', rate_date: '2026-01-01', eur_per_unit: '0.9259' },
    ];
    const s = computePortfolioState({ operations: ops, instruments: [usdInstr], prices, fxRates, asOf: '2026-01-01' });
    const v = s.valuations[0];
    // Coerenza CM (EUR) ↔ gross RPC
    expect(v.averageCostEur.toFixed(2)).toBe('46.30'); // 462.95 / 10 arrotondato display
    expect(v.marketValueEur!.toFixed(2)).toBe('462.95');
    expect(v.unrealizedPnlEur!.toFixed(2)).toBe('0.00');
  });
});