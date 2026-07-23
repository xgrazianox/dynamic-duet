import { describe, it, expect } from 'vitest';
import { Decimal, D, ZERO } from '@/domain/decimal';
import { computeRegimeState, type RegimeDecisionInput } from '@/domain/regimeState';
import { computeRebalancePlan, type RebalanceInputs, type RebalanceInstrument } from '@/domain/rebalance';
import type { PositionValuation } from '@/domain/pnl';

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

// ===== 2) TARGET CON PESO ZERO =====
describe('hotfix — target con peso zero', () => {
  it('posseduta + riga target zero → sellAll con quantità = posseduto', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '7', '10', '70'), val('BBB', '930', '1', '930')],
      cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('0') },       // peso ZERO esplicito
        { instrumentId: 'BBB', weightPct: D('90') },
        { instrumentId: null, weightPct: D('10') }],
    }));
    const r = plan.rows.find(x => x.instrumentId === 'AAA')!;
    expect(r.sellAll).toBe(true);
    expect(r.action).toBe('SELL');
    expect(r.quantity!.toFixed(0)).toBe('7'); // 70€ < min 100 ignorato
  });

  it('non posseduta + target zero + NESSUN prezzo → piano NON bloccato (fuori universo)', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '1000', '1', '1000')], cashEur: D('0'),
      instruments: [inst('ZZZ'), inst('BBB')],
      // nessun prezzo per ZZZ
      targetRows: [
        { instrumentId: 'ZZZ', weightPct: D('0') },
        { instrumentId: 'BBB', weightPct: D('100') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    expect(plan.status).toBe('ok');
    expect(plan.rows.some(r => r.instrumentId === 'ZZZ')).toBe(false); // fuori universo
  });

  it('target POSITIVO senza prezzo → piano ancora bloccato', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '1000', '1', '1000')], cashEur: D('0'),
      instruments: [inst('ZZZ'), inst('BBB')],
      targetRows: [
        { instrumentId: 'ZZZ', weightPct: D('10') },
        { instrumentId: 'BBB', weightPct: D('90') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    expect(plan.status).toBe('blocked');
    expect(plan.blockReasons.join()).toMatch(/ZZZ: prezzo mancante/);
  });

  it('cash target zero → riga cash comunque presente', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('BBB', '1000', '1', '1000')], cashEur: D('0'),
      instruments: [inst('BBB')],
      targetRows: [
        { instrumentId: 'BBB', weightPct: D('100') },
        { instrumentId: null, weightPct: D('0') }],
    }));
    const cashRow = plan.rows.find(r => r.instrumentId === null);
    expect(cashRow).toBeDefined();
    expect(cashRow!.targetWeightPct.isZero()).toBe(true);
  });
});

// ===== 3) COMMISSIONI E DEVIAZIONI RESIDUE =====
describe('hotfix — valore post-commissioni e invariante', () => {
  it('€1.000 iniziali, fee €5 SELL + €5 BUY → simulato €990, pesi su 990, invariante', () => {
    // AAA 1000 (100%); target AAA 50 / BBB 50 / cash 0
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '1000', '1', '1000')], cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      prices: [{ instrument_id: 'BBB', price_date: '2026-07-01', close_price: '1' }],
      targetRows: [
        { instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: 'BBB', weightPct: D('50') },
        { instrumentId: null, weightPct: D('0') }],
      settings: { ...SETTINGS, simulatedFeeEur: D('5') },
    }));
    expect(plan.totalValueEur!.toFixed(2)).toBe('1000.00');
    expect(plan.totalFeesEur.toFixed(2)).toBe('10.00');
    expect(plan.postTradeTotalEur!.toFixed(2)).toBe('990.00');
    // invariante: cashAfter + posizioni simulate = postTradeTotal
    const inv = plan.cashAfterEur!.plus(plan.simulatedPositionsValueEur!);
    expect(inv.minus(plan.postTradeTotalEur!).abs().lt(D('0.000001'))).toBe(true);
    // residuo AAA calcolato su 990: AAA simulata 500 → 500/990=50.505% → residuo ~0.505 (non 0)
    const aaa = plan.rows.find(r => r.instrumentId === 'AAA')!;
    expect(Number(aaa.residualDeviationPp!.toFixed(3))).toBeCloseTo(0.505, 2);
    // il calcolo su 1000 avrebbe dato 0: dimostra che la base è 990
    expect(aaa.residualDeviationPp!.gt(0)).toBe(true);
  });
});

// ===== 4) CASH NEGATIVO MAI MASCHERATO =====
describe('hotfix — cash negativo non mascherato', () => {
  it('cash 0, fuori-target €30, fee €50 → cashAfter=−20 reale, piano non eseguibile', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '3', '10', '30'), val('BBB', '970', '1', '970')],
      cashEur: D('0'),
      instruments: [inst('AAA'), inst('BBB')],
      targetRows: [
        { instrumentId: 'BBB', weightPct: D('97') },
        { instrumentId: null, weightPct: D('3') }],
      settings: { ...SETTINGS, simulatedFeeEur: D('50') },
    }));
    const sellAll = plan.rows.find(r => r.instrumentId === 'AAA')!;
    expect(sellAll.sellAll).toBe(true);
    expect(plan.cashAfterEur!.toFixed(2)).toBe('-20.00');  // MAI azzerato
    expect(plan.executable).toBe(false);
    expect(plan.infeasibleReasons.join()).toMatch(/commissioni simulate superano/);
  });

  it('piano sano → executable=true, nessun motivo di infattibilità', () => {
    const plan = computeRebalancePlan(rebInputs({
      valuations: [val('AAA', '500', '1', '500')], cashEur: D('500'),
      instruments: [inst('AAA')],
      targetRows: [{ instrumentId: 'AAA', weightPct: D('50') }, { instrumentId: null, weightPct: D('50') }],
    }));
    expect(plan.executable).toBe(true);
    expect(plan.infeasibleReasons).toHaveLength(0);
  });
});

// ===== 6) OLTRE 120 DECISIONI =====
describe('hotfix — lunga coda di UNDETERMINED', () => {
  it('130 UNDETERMINED dopo una determinata → il regime applicabile resta quello determinato', () => {
    const decisions: RegimeDecisionInput[] = [{
      id: 'det', as_of_month: '2015-01-01', decided_at: '2015-01-02T00:00:00Z',
      final_regime: 'RISK_OFF', is_switch: false, acknowledged_at: null,
    }];
    for (let i = 0; i < 130; i++) {
      const y = 2015 + Math.floor((i + 1) / 12), m = ((i + 1) % 12) + 1;
      decisions.push({
        id: `u${i}`, as_of_month: `${y}-${String(m).padStart(2, '0')}-01`,
        decided_at: `${y}-${String(m).padStart(2, '0')}-02T00:00:00Z`,
        final_regime: null, is_switch: false, acknowledged_at: null,
      });
    }
    expect(decisions.length).toBeGreaterThan(120);
    const rs = computeRegimeState(decisions, null);
    expect(rs.latestDetermined?.id).toBe('det');
    expect(rs.applicableRegime).toBe('RISK_OFF');
    expect(rs.latestDecision?.final_regime).toBeNull();
  });
});
