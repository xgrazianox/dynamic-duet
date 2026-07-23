import { describe, it, expect } from 'vitest';
import { Decimal, D, ZERO } from '@/domain/decimal';
import { computeRegimeState, type RegimeDecisionInput } from '@/domain/regimeState';
import { deriveAlerts, type AlertsInputs } from '@/domain/alerts';
import { computeRebalancePlan, type RebalanceInputs, type RebalanceInstrument } from '@/domain/rebalance';
import type { PositionValuation } from '@/domain/pnl';

// ---------- helpers ----------
const dec = (o: Partial<RegimeDecisionInput>): RegimeDecisionInput => ({
  id: o.id ?? 'd', as_of_month: o.as_of_month ?? '2026-01-01',
  decided_at: o.decided_at ?? '2026-01-05T00:00:00Z',
  final_regime: o.final_regime === undefined ? 'RISK_ON' : o.final_regime,
  is_switch: o.is_switch ?? false, acknowledged_at: o.acknowledged_at ?? null,
});
const inst = (id: string, o?: Partial<RebalanceInstrument>): RebalanceInstrument => ({
  id, ticker: id, currency: 'EUR', status: 'active', quantityStep: '1', ...o,
});
function val(id: string, qty: string, priceEur: string, costEur: string, o?: Partial<PositionValuation>): PositionValuation {
  const q = D(qty), p = D(priceEur), c = D(costEur);
  const mv = q.times(p);
  return {
    instrumentId: id, currency: 'EUR', quantity: q, averageCostEur: q.gt(0) ? c.div(q) : ZERO,
    totalCostEur: c, realizedPnlEur: ZERO, status: 'valued',
    lastPriceNative: p, lastPriceDate: '2026-07-01', fxEurPerUnit: new Decimal(1), fxDate: '2026-07-01',
    marketValueEur: mv, unrealizedPnlEur: mv.minus(c), hasPrice: true, ...o,
  };
}
const SETTINGS = {
  tolerancePp: D('0.5'), roundingEur: D('50'), minTradeEur: D('100'),
  simulatedFeeEur: D('0'), stalePriceDays: 45,
};
function rebInputs(o: Partial<RebalanceInputs>): RebalanceInputs {
  return {
    valuations: [], cashEur: ZERO, instruments: [], prices: [], fxRates: [],
    targetRows: null, applicableRegime: 'RISK_ON', settings: SETTINGS, asOf: '2026-07-01', ...o,
  };
}
function alertInputs(o: Partial<AlertsInputs>): AlertsInputs {
  return {
    valuations: [], instruments: [], plan: null,
    regimeState: computeRegimeState([dec({})], 'RISK_ON'),
    hasActiveTargetForApplicable: true,
    takeProfitPct: D('30'), stalePriceDays: 45, tolerancePp: D('0.5'), asOf: '2026-07-01', ...o,
  };
}

// ================= 10.1 — regime state =================
describe('regime state (10.1, lato dominio)', () => {
  it('prima decisione determinata → adozione, nessun alert switch', () => {
    const rs = computeRegimeState([dec({ id: 'a', is_switch: false })], null);
    expect(rs.applicableRegime).toBe('RISK_ON');
    expect(rs.isFirstAdoption).toBe(true);
    expect(rs.migrationNeeded).toBe(true);
    expect(rs.unacknowledgedSwitches).toHaveLength(0);
  });
  it('switch non acknowledged visibile; ack → nascosto ma migrationNeeded resta', () => {
    const sw = dec({ id: 'b', as_of_month: '2026-02-01', final_regime: 'RISK_OFF', is_switch: true });
    let rs = computeRegimeState([dec({ id: 'a' }), sw], 'RISK_ON');
    expect(rs.unacknowledgedSwitches.map(d => d.id)).toEqual(['b']);
    expect(rs.migrationNeeded).toBe(true);
    rs = computeRegimeState([dec({ id: 'a' }), { ...sw, acknowledged_at: '2026-02-02T00:00:00Z' }], 'RISK_ON');
    expect(rs.unacknowledgedSwitches).toHaveLength(0);
    expect(rs.migrationNeeded).toBe(true); // ack NON cambia la necessità di migrazione
  });
  it('UNDETERMINED successiva non cancella l\'ultima determinata', () => {
    const rs = computeRegimeState([
      dec({ id: 'a', as_of_month: '2026-01-01', final_regime: 'RISK_OFF' }),
      dec({ id: 'u', as_of_month: '2026-02-01', final_regime: null }),
    ], null);
    expect(rs.latestDecision?.id).toBe('u');
    expect(rs.latestDetermined?.id).toBe('a');
    expect(rs.applicableRegime).toBe('RISK_OFF');
  });
  it('ritorno al regime applicato → migrationNeeded=false', () => {
    const rs = computeRegimeState([
      dec({ id: 'a', as_of_month: '2026-01-01', final_regime: 'RISK_ON' }),
      dec({ id: 'b', as_of_month: '2026-02-01', final_regime: 'RISK_OFF', is_switch: true }),
      dec({ id: 'c', as_of_month: '2026-03-01', final_regime: 'RISK_ON', is_switch: true }),
    ], 'RISK_ON');
    expect(rs.applicableRegime).toBe('RISK_ON');
    expect(rs.migrationNeeded).toBe(false);
  });
  it('nessuna decisione determinata → nessun regime applicabile', () => {
    const rs = computeRegimeState([dec({ id: 'u', final_regime: null })], null);
    expect(rs.applicableRegime).toBeNull();
    expect(rs.migrationNeeded).toBe(false);
  });
});

// ================= 10.2 — alert =================
describe('alert derivati (10.2)', () => {
  const A = val('AAA', '10', '10', '100');       // 100€, in target
  const instruments = [{ id: 'AAA', ticker: 'AAA' }, { id: 'BBB', ticker: 'BBB' }];

  function planFor(valuations: PositionValuation[], target: { id: string | null; w: string }[], cash = '0') {
    return computeRebalancePlan(rebInputs({
      valuations, cashEur: D(cash),
      instruments: [inst('AAA'), inst('BBB')],
      targetRows: target.map(t => ({ instrumentId: t.id, weightPct: D(t.w) })),
    }));
  }

  it('deviazione = tolleranza → nessun alert; +0,01pp → alert', () => {
    // AAA 100€ su totale 200€ → 50%. Target 49.5% → delta 0.5pp = tolleranza → NO alert
    const plan1 = planFor([A], [{ id: 'AAA', w: '49.5' }, { id: null, w: '50.5' }], '100');
    const a1 = deriveAlerts(alertInputs({ valuations: [A], instruments, plan: plan1 }));
    expect(a1.filter(x => x.code === 'TARGET_DEVIATION')).toHaveLength(0);
    // Target 49.49% → delta 0.51pp > 0.5 → alert (su AAA e specularmente su cash)
    const plan2 = planFor([A], [{ id: 'AAA', w: '49.49' }, { id: null, w: '50.51' }], '100');
    const a2 = deriveAlerts(alertInputs({ valuations: [A], instruments, plan: plan2 }));
    expect(a2.some(x => x.code === 'TARGET_DEVIATION' && x.instrumentId === 'AAA')).toBe(true);
  });

  it('take-profit: bordo incluso; costo zero → nessun alert né divisione', () => {
    const tp = val('AAA', '10', '13', '100'); // uPnL 30 su costo 100 = 30% = soglia → alert
    const a = deriveAlerts(alertInputs({ valuations: [tp], instruments }));
    expect(a.some(x => x.code === 'TAKE_PROFIT')).toBe(true);
    const zeroCost = val('AAA', '10', '13', '0');
    const a2 = deriveAlerts(alertInputs({ valuations: [zeroCost], instruments }));
    expect(a2.some(x => x.code === 'TAKE_PROFIT')).toBe(false);
  });

  it('stantio: esattamente alla soglia → no; soglia+1 → sì', () => {
    const atLimit = val('AAA', '1', '10', '10', { lastPriceDate: '2026-05-17' }); // 45 giorni al 2026-07-01
    const over = val('AAA', '1', '10', '10', { lastPriceDate: '2026-05-16' });    // 46 giorni
    expect(deriveAlerts(alertInputs({ valuations: [atLimit], instruments })).some(x => x.code === 'STALE_PRICE')).toBe(false);
    expect(deriveAlerts(alertInputs({ valuations: [over], instruments })).some(x => x.code === 'STALE_PRICE')).toBe(true);
  });

  it('missing price e missing FX distinti nel messaggio', () => {
    const mp = val('AAA', '1', '10', '10', { status: 'missing_price', marketValueEur: null, unrealizedPnlEur: null });
    const mf = val('BBB', '1', '10', '10', { status: 'missing_fx', currency: 'USD', marketValueEur: null, unrealizedPnlEur: null });
    const a = deriveAlerts(alertInputs({ valuations: [mp, mf], instruments }));
    const inc = a.find(x => x.code === 'VALUATION_INCOMPLETE');
    expect(inc).toBeDefined();
    expect(inc!.reason).toMatch(/AAA \(prezzo mancante\)/);
    expect(inc!.reason).toMatch(/BBB \(cambio USD mancante\)/);
  });

  it('gli alert derivati non hanno semantica "risolto"', () => {
    const a = deriveAlerts(alertInputs({ valuations: [A], instruments }));
    for (const x of a) {
      expect('resolved' in x).toBe(false);
      expect('status' in x).toBe(false);
    }
  });
});

// ================= 10.3 — ribilanciamento =================
describe('piano di ribilanciamento (10.3)', () => {
  it('cash incluso nell\'universo (riga sintetica con pesi)', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '10', '10', '100')], cashEur: D('100'),
      instruments: [inst('AAA')],
      targetRows: [{ instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: null, weightPct: D('50') }],
    }));
    const cashRow = plan.rows.find(r => r.instrumentId === null);
    expect(cashRow).toBeDefined();
    expect(Number(cashRow!.currentWeightPct.toFixed(2))).toBe(50);
  });

  it('posizione fuori target → vendita TOTALE anche sotto minimo/rounding', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '3', '10', '30'), val('BBB', '97', '1', '97')], // AAA 30€ fuori target
      cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      targetRows: [{ instrumentId: 'BBB', weightPct: D('80') }, { instrumentId: null, weightPct: D('20') }],
    }));
    const r = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(r.sellAll).toBe(true);
    expect(r.action).toBe('SELL');
    expect(r.quantity!.toFixed(0)).toBe('3'); // tutta la quantità, 30€ < min 100 ignorato
    expect(r.suppressed).toBe(false);
  });

  it('BUY arrotondata per difetto con step 1 e 0,001', () => {
    // tot 1000, AAA 0% → target 30% → trade 300€, prezzo 7 → 42.857…
    const mk = (step: string) => computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '700', '1', '700')], cashEur: D('300'),
      instruments: [inst('AAA', { quantityStep: step }), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '7' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('30') }, { instrumentId: 'BBB', weightPct: D('70') },
        { instrumentId: null, weightPct: D('0') }],
    })).rows.find(r => r.instrumentId === 'AAA')!;
    expect(mk('1').quantity!.toFixed(0)).toBe('42');          // floor(300/7)=42
    expect(mk('0.001').quantity!.toFixed(3)).toBe('42.857');  // floor a 3 decimali
  });

  it('SELL mai oltre il posseduto', () => {
    // AAA 90% vs target 10% → trade teorico 800€ ma posseduti 9 pezzi da 100
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '9', '100', '900')], cashEur: D('100'),
      instruments: [inst('AAA')],
      targetRows: [{ instrumentId: 'AAA', weightPct: D('10') }, { instrumentId: null, weightPct: D('90') }],
    }));
    const r = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(r.action).toBe('SELL');
    expect(r.quantity!.lte(D('9'))).toBe(true);
  });

  it('€1.234 teorico con rounding 50 → €1.250', () => {
    // tot 10000; AAA corrente 0, target 12.34% → 1234€ → 1250
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '10000', '1', '10000')], cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('12.34') }, { instrumentId: 'BBB', weightPct: D('87.66') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    const r = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(r.theoreticalEur!.toFixed(0)).toBe('1250');
  });

  it('€80 con minimo 100 → soppressa e dichiarata', () => {
    // tot 1000, delta 8% → 80€ (rounding 50 → 100? no: 80/50=1.6→2→100!) — uso rounding 10 per restare a 80
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '920', '1', '920')], cashEur: D('80'),
      instruments: [inst('AAA'), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('8') }, { instrumentId: 'BBB', weightPct: D('92') },
        { instrumentId: null, weightPct: D('0') }],
      settings: { ...SETTINGS, roundingEur: D('10') },
    }));
    const r = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(r.suppressed).toBe(true);
    expect(r.suppressReason).toMatch(/soglia minima/);
    expect(r.theoreticalEur!.toFixed(0)).toBe('80');
  });

  it('vendite prima degli acquisti: cash iniziale 0 con vendite sufficienti', () => {
    // vendo BBB (sovrappeso) per comprare AAA con cash 0
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '1000', '1', '1000')], cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: 'BBB', weightPct: D('50') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    const buy = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(buy.action).toBe('BUY');
    expect(buy.suppressed).toBe(false);
    expect(plan.cashAfterEur!.gte(0)).toBe(true);
  });

  it('commissioni incluse nella capienza; cash insufficiente → BUY ridotta, cash mai negativo', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '500', '1', '500')], cashEur: D('500'),
      instruments: [inst('AAA'), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: 'BBB', weightPct: D('50') },
        { instrumentId: null, weightPct: D('0') }],
      settings: { ...SETTINGS, simulatedFeeEur: D('5') },
    }));
    const buy = plan.rows.find(x => x.instrumentId === 'AAA')!;
    // teorico 500 ma capienza 500−5 → qty 495
    expect(buy.quantity!.toFixed(0)).toBe('495');
    expect(plan.cashShortfall).not.toBeNull();
    expect(plan.cashAfterEur!.gte(0)).toBe(true);
  });

  it('strumento archiviato mai BUY (riga bloccata con avviso di configurazione)', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '900', '1', '900')], cashEur: D('100'),
      instruments: [inst('AAA', { status: 'archived' }), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('10') }, { instrumentId: 'BBB', weightPct: D('90') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    const r = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(r.blockedReason).toMatch(/archiviato/);
    expect(r.quantity).toBeNull();
  });

  it('prezzo mancante → piano bloccato; stantio → warning ma piano disponibile', () => {
    const blocked = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '1', '10', '10', { status: 'missing_price', marketValueEur: null })],
      cashEur: D('100'), instruments: [inst('AAA')],
      targetRows: [{ instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: null, weightPct: D('50') }],
    }));
    expect(blocked.status).toBe('blocked');
    expect(blocked.blockReasons.join()).toMatch(/prezzo mancante/);

    const stale = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '10', '10', '100', { lastPriceDate: '2026-01-01' })], cashEur: D('100'),
      instruments: [inst('AAA')],
      targetRows: [{ instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: null, weightPct: D('50') }],
    }));
    expect(stale.status).toBe('ok');
    expect(stale.staleWarnings).toContain('AAA');
  });

  it('senza regime applicabile o senza target → bloccato', () => {
    const noRegime = computeRebalancePlan(rebInputs({ applicableRegime: null, targetRows: [] }));
    expect(noRegime.status).toBe('blocked');
    const noTarget = computeRebalancePlan(rebInputs({ targetRows: null, cashEur: D('100') }));
    expect(noTarget.status).toBe('blocked');
  });

  it('deviazione residua esposta e coerente', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '1000', '1', '1000')], cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      prices: [{ instrument_id: 'AAA', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: 'BBB', weightPct: D('50') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    const buy = plan.rows.find(x => x.instrumentId === 'AAA')!;
    // eseguendo il BUY da 500 → peso 50% → residuo ~0
    expect(Number(buy.residualDeviationPp!.toFixed(2))).toBeLessThanOrEqual(0.01);
  });
});
