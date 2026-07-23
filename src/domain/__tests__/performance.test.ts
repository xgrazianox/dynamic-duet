import { describe, it, expect } from 'vitest';
import { computePerformance, type PerformanceInputs } from '@/domain/performance';
import { computePortfolioState } from '@/domain/computePortfolioState';
import type { LedgerRow, InstrumentRow, PriceRow } from '@/domain/types';

// ---- compact ledger factory (auto seq / recorded_at) ----
let seq = 0;
function reset() { seq = 0; }
function op(o: Partial<LedgerRow>): LedgerRow {
  seq += 1;
  return {
    id: o.id ?? `op${seq}`,
    portfolio_id: 'p',
    op_type: o.op_type ?? 'DEPOSIT',
    effective_date: o.effective_date ?? '2026-01-01',
    recorded_at: `2000-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    seq: String(seq),
    instrument_id: o.instrument_id ?? null,
    quantity: o.quantity ?? null,
    gross_amount_eur: o.gross_amount_eur ?? null,
    fees_eur: o.fees_eur ?? '0',
    opening_cost_eur: o.opening_cost_eur ?? null,
    reversal_of_operation_id: o.reversal_of_operation_id ?? null,
    currency: o.currency ?? null,
    price_ccy: o.price_ccy ?? null,
    fx_eur_per_unit: o.fx_eur_per_unit ?? null,
  };
}
const AAA: InstrumentRow = { id: 'AAA', ticker: 'AAA', name: 'A', currency: 'EUR', quantity_step: '1' };
const price = (d: string, p: string): PriceRow => ({ instrument_id: 'AAA', price_date: d, close_price: p });
function inputs(o: Partial<PerformanceInputs> & { operations: LedgerRow[]; trackingStartedOn: string | null; asOf: string }): PerformanceInputs {
  return { instruments: [AAA], prices: [], fxRates: [], ...o };
}
const pct = (d: import('@/domain/decimal').Decimal | null) => d === null ? null : Number(d.toFixed(4));

describe('Modified Dietz — casi golden', () => {
  it('apertura: costo €100, mercato €120 → P/L €20, Dietz 0%', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'AAA', effective_date: '2026-01-31', quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '120', currency: 'EUR', fx_eur_per_unit: '1' })];
    const inp = inputs({ operations: ops, prices: [price('2026-01-31', '120'), price('2026-02-28', '120')], trackingStartedOn: '2026-01-31', asOf: '2026-02-28' });
    const r = computePerformance(inp);
    expect(pct(r.sinceInception.returnPct)).toBe(0);
    const totals = computePortfolioState({ operations: ops, instruments: [AAA], prices: inp.prices, fxRates: [], asOf: '2026-02-28' }).totals;
    expect(Number(totals.managerialPnlEur!.toFixed(2))).toBe(20);
  });

  it('mercato successivo €132 senza flussi → P/L €32, Dietz 10%', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'AAA', effective_date: '2026-01-31', quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '120', currency: 'EUR', fx_eur_per_unit: '1' })];
    const inp = inputs({ operations: ops, prices: [price('2026-01-31', '120'), price('2026-02-28', '132')], trackingStartedOn: '2026-01-31', asOf: '2026-02-28' });
    const r = computePerformance(inp);
    expect(pct(r.sinceInception.returnPct)).toBe(10);
    const totals = computePortfolioState({ operations: ops, instruments: [AAA], prices: inp.prices, fxRates: [], asOf: '2026-02-28' }).totals;
    expect(Number(totals.managerialPnlEur!.toFixed(2))).toBe(32);
  });

  it('VI 100, OTHER_INCOME 10, VF 110 → Dietz 10%', () => {
    reset();
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' }),
      op({ op_type: 'OTHER_INCOME', effective_date: '2026-02-15', gross_amount_eur: '10' }),
    ];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-02-28' }));
    expect(pct(r.sinceInception.returnPct)).toBe(10);
    expect(Number(r.sinceInception.netFlows.toFixed(2))).toBe(0); // income NON è flusso esterno
  });

  it('VI 100, FEE 10, VF 90 → Dietz −10%', () => {
    reset();
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' }),
      op({ op_type: 'FEE', effective_date: '2026-02-15', gross_amount_eur: '10' }),
    ];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-02-28' }));
    expect(pct(r.sinceInception.returnPct)).toBe(-10);
  });

  it('deposito €100 a metà periodo, VI 100, VF 210 → Dietz 6.6667%', () => {
    reset();
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '100' }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-16', gross_amount_eur: '100' }),   // w = (30-15)/30 = 0.5
      op({ op_type: 'OTHER_INCOME', effective_date: '2026-01-20', gross_amount_eur: '10' }), // +10 interno → VF 210
    ];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-01', asOf: '2026-01-31' }));
    expect(pct(r.sinceInception.returnPct)).toBe(6.6667);
    expect(Number(r.sinceInception.netFlows.toFixed(2))).toBe(100);
  });

  it('prelievo negativo con peso corretto: VI 200, WITHDRAW 100 a metà, VF 100 → 0%', () => {
    reset();
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '200' }),
      op({ op_type: 'WITHDRAW', effective_date: '2026-01-16', gross_amount_eur: '100' }),
    ];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-01', asOf: '2026-01-31' }));
    expect(pct(r.sinceInception.returnPct)).toBe(0);
    expect(Number(r.sinceInception.netFlows.toFixed(2))).toBe(-100);
  });

  it('BUY/SELL/DIVIDEND non sono flussi esterni', () => {
    reset();
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '1000' }),
      op({ op_type: 'BUY', instrument_id: 'AAA', effective_date: '2026-02-01', quantity: '10', gross_amount_eur: '100', price_ccy: '10', currency: 'EUR', fx_eur_per_unit: '1' }),
      op({ op_type: 'DIVIDEND', instrument_id: 'AAA', effective_date: '2026-02-10', gross_amount_eur: '10' }),
    ];
    const inp = inputs({ operations: ops, prices: [price('2026-01-31', '10'), price('2026-02-28', '10')], trackingStartedOn: '2026-01-31', asOf: '2026-02-28' });
    const r = computePerformance(inp);
    expect(Number(r.sinceInception.netFlows.toFixed(2))).toBe(0); // nessun DEPOSIT/WITHDRAW
  });

  it('più flussi nella stessa data: aggregati (equivalenti al combinato)', () => {
    reset();
    const twoSame = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '100' }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-16', gross_amount_eur: '50' }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-16', gross_amount_eur: '50' }),
    ];
    reset();
    const oneCombined = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '100' }),
      op({ op_type: 'DEPOSIT', effective_date: '2026-01-16', gross_amount_eur: '100' }),
    ];
    const a = computePerformance(inputs({ operations: twoSame, trackingStartedOn: '2026-01-01', asOf: '2026-01-31' }));
    const b = computePerformance(inputs({ operations: oneCombined, trackingStartedOn: '2026-01-01', asOf: '2026-01-31' }));
    expect(pct(a.sinceInception.returnPct)).toBe(pct(b.sinceInception.returnPct));
  });

  it('REVERSAL: il deposito stornato non è un flusso e non muove il valore', () => {
    reset();
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' }),
      op({ id: 'DEP', op_type: 'DEPOSIT', effective_date: '2026-02-10', gross_amount_eur: '50' }),
      op({ op_type: 'REVERSAL', effective_date: '2026-02-10', reversal_of_operation_id: 'DEP' }),
    ];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-02-28' }));
    expect(Number(r.sinceInception.netFlows.toFixed(2))).toBe(0);
    expect(pct(r.sinceInception.returnPct)).toBe(0); // valore invariato a 100
  });

  it('T=0 → n/d', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' })];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-01-31' }));
    expect(r.sinceInception.status).toBe('na');
    expect(r.sinceInception.returnPct).toBeNull();
  });

  it('denominatore ≤ 0 → n/d (ledger economicamente valido: cash mai negativo)', () => {
    reset();
    // OPENING_CASH 100, OTHER_INCOME 100 (interno, non flusso) PRIMA del WITHDRAW 200:
    // il cash resta ≥ 0 in ogni istante, ma il denominatore Dietz
    // = VI 100 − 200·w  con w=(30−2)/30 → 100 − 186,67 < 0 → n/d.
    const ops = [
      op({ op_type: 'OPENING_CASH', effective_date: '2026-01-01', gross_amount_eur: '100' }),
      op({ op_type: 'OTHER_INCOME', effective_date: '2026-01-02', gross_amount_eur: '100' }),
      op({ op_type: 'WITHDRAW', effective_date: '2026-01-03', gross_amount_eur: '200' }),
    ];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-01', asOf: '2026-01-31' }));
    expect(r.sinceInception.status).toBe('na');
    expect(r.sinceInception.reason).toMatch(/denominatore/);
  });

  it('prezzo completamente mancante → n/d', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'AAA', effective_date: '2026-01-31', quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '100', currency: 'EUR', fx_eur_per_unit: '1' })];
    // nessun price row fornito → posizione aperta non valorizzabile (missing_price)
    const r = computePerformance(inputs({ operations: ops, prices: [], trackingStartedOn: '2026-01-31', asOf: '2026-02-28' }));
    expect(r.sinceInception.status).toBe('na');
    expect(r.valueSeries.every(v => v.status === 'na')).toBe(true);
  });

  it('FX mancante (strumento USD con prezzo, nessun fx_rate) → n/d', () => {
    reset();
    const USD: InstrumentRow = { id: 'UUU', ticker: 'UUU', name: 'U', currency: 'USD', quantity_step: '1' };
    const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'UUU', effective_date: '2026-01-31', quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '110', currency: 'USD', fx_eur_per_unit: '0.9' })];
    const prices: PriceRow[] = [{ instrument_id: 'UUU', price_date: '2026-01-31', close_price: '110' }];
    const r = computePerformance({ operations: ops, instruments: [USD], prices, fxRates: [], trackingStartedOn: '2026-01-31', asOf: '2026-02-28' });
    expect(r.sinceInception.status).toBe('na'); // missing_fx, non missing_price
    expect(r.valueSeries.every(v => v.status === 'na')).toBe(true);
  });

  it('prezzo precedente ma stantio → valore disponibile con warning', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'AAA', effective_date: '2026-01-31', quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '120', currency: 'EUR', fx_eur_per_unit: '1' })];
    const r = computePerformance(inputs({ operations: ops, prices: [price('2026-01-31', '120')], trackingStartedOn: '2026-01-31', asOf: '2026-03-31' }));
    const last = r.valueSeries[r.valueSeries.length - 1];
    expect(last.status).toBe('ok');
    expect(last.value).not.toBeNull();
    expect(last.stale).toBe(true); // 59 giorni > 45
  });

  it('stantio — confini: 45 giorni no, 46 sì, ieri (anche a cavallo di mese) no', () => {
    reset();
    const mk = (priceDate: string, asOf: string) => {
      reset();
      const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'AAA', effective_date: priceDate, quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '120', currency: 'EUR', fx_eur_per_unit: '1' })];
      const r = computePerformance(inputs({ operations: ops, prices: [price(priceDate, '120')], trackingStartedOn: priceDate, asOf, stalePriceDays: 45 }));
      return r.valueSeries[r.valueSeries.length - 1];
    };
    // 2026-01-01 → 2026-02-15 = 45 giorni esatti → NON stantio (confine esclusivo)
    expect(mk('2026-01-01', '2026-02-15').stale).toBe(false);
    // 2026-01-01 → 2026-02-16 = 46 giorni → stantio
    expect(mk('2026-01-01', '2026-02-16').stale).toBe(true);
    // prezzo di ieri, mese precedente (2026-01-31 → 2026-02-01 = 1 giorno) → NON stantio
    expect(mk('2026-01-31', '2026-02-01').stale).toBe(false);
  });

  it('confini mensili: tracking a fine mese → un solo periodo, nessun t0→t0', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' })];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-02-28' }));
    expect(r.monthly).toHaveLength(1);
    expect(r.monthly[0].periodStart).toBe('2026-01-31');
    expect(r.monthly[0].periodEnd).toBe('2026-02-28');
    expect(r.monthly.every(m => m.periodEnd > m.periodStart)).toBe(true);
  });

  it('curva del valore: date uniche e ordinate, t0 mai duplicato', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' })];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-03-15' }));
    const dates = r.valueSeries.map(p => p.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[0]).toBe('2026-01-31');
  });

  it('tracking = asOf → since-inception n/d per T=0 e nessun falso periodo mensile', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' })];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-01-31' }));
    expect(r.sinceInception.status).toBe('na');
    expect(r.monthly).toHaveLength(0);
    expect(r.valueSeries.map(p => p.date)).toEqual(['2026-01-31']);
  });

  it('nessun flusso: concatenamento mensile = rendimento complessivo (caso particolare)', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_POSITION', instrument_id: 'AAA', effective_date: '2025-12-01', quantity: '1', opening_cost_eur: '100', gross_amount_eur: '100', price_ccy: '100', currency: 'EUR', fx_eur_per_unit: '1' })];
    const prices = [price('2025-12-01', '100'), price('2025-12-31', '100'), price('2026-01-31', '110'), price('2026-02-28', '121')];
    const r = computePerformance(inputs({ operations: ops, prices, trackingStartedOn: '2025-12-01', asOf: '2026-02-28' }));
    const chained = r.monthly.reduce((acc, m) => m.returnPct ? acc * (1 + Number(m.returnPct) / 100) : acc, 1) - 1;
    expect(Number((chained * 100).toFixed(2))).toBe(Number(r.sinceInception.returnPct!.toFixed(2)));
    expect(Number(r.sinceInception.returnPct!.toFixed(2))).toBe(21);
  });

  it('primo mese parziale parte da tracking_started_on', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_CASH', effective_date: '2026-01-10', gross_amount_eur: '100' })];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-10', asOf: '2026-02-28' }));
    expect(r.monthly[0].periodStart).toBe('2026-01-10');
    expect(r.monthly[0].periodEnd).toBe('2026-01-31');
  });
});

describe('win-rate — per singola SELL', () => {
  const buy = (o?: Partial<LedgerRow>) => op({ op_type: 'BUY', instrument_id: 'AAA', effective_date: '2026-01-05', quantity: '10', gross_amount_eur: '100', price_ccy: '10', currency: 'EUR', fx_eur_per_unit: '1', ...o });
  const sell = (id: string, gross: string, o?: Partial<LedgerRow>) => op({ id, op_type: 'SELL', instrument_id: 'AAA', effective_date: '2026-02-05', quantity: '2', gross_amount_eur: gross, price_ccy: '10', currency: 'EUR', fx_eur_per_unit: '1', ...o });

  it('utile / perdita / pareggio contati e classificati', () => {
    reset();
    const ops = [buy(), sell('s1', '30'), sell('s2', '10'), sell('s3', '20')]; // avg 10 → +10 / −10 / 0
    const r = computePerformance(inputs({ operations: ops, prices: [price('2026-02-28', '10')], trackingStartedOn: '2026-01-05', asOf: '2026-02-28' }));
    expect(r.winRate).toMatchObject({ total: 3, wins: 1, losses: 1, breakeven: 1 });
    expect(Number(r.winRate.ratePct!.toFixed(4))).toBe(33.3333);
  });

  it('SELL stornata esclusa via netting REVERSAL', () => {
    reset();
    const ops = [buy(), sell('s1', '30'), sell('s2', '30'), op({ op_type: 'REVERSAL', effective_date: '2026-02-05', reversal_of_operation_id: 's2' })];
    const r = computePerformance(inputs({ operations: ops, prices: [price('2026-02-28', '10')], trackingStartedOn: '2026-01-05', asOf: '2026-02-28' }));
    expect(r.winRate.total).toBe(1);
    expect(r.winRate.wins).toBe(1);
  });

  it('nessuna SELL → win-rate n/d (non 0%)', () => {
    reset();
    const ops = [op({ op_type: 'OPENING_CASH', effective_date: '2026-01-31', gross_amount_eur: '100' })];
    const r = computePerformance(inputs({ operations: ops, trackingStartedOn: '2026-01-31', asOf: '2026-02-28' }));
    expect(r.winRate.total).toBe(0);
    expect(r.winRate.ratePct).toBeNull();
  });
});
