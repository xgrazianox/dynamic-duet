import { describe, it, expect } from 'vitest';
import {
  ENGINE_VERSION,
  calculateSignalB,
  alignMonthlyPairs,
  requiredMonths,
  evaluateRegime,
  configFromDb,
  canonicalInputString,
  defaultSignalEngineConfig,
  type PricePoint,
  type MonthlyPair,
} from '@/domain/signalEngine';

// helper: build a monthly price series 'YYYY-MM-01'
const series = (start: number, n: number, step = 1): PricePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2020, 0 + i, 1));
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { date: `${m}-01`, close: start + i * step };
  });

describe('B3 volatility filter — insufficient history', () => {
  it('B3 is NEUTRAL (not ON) when i < b3VolLookback', () => {
    const cfg = { ...defaultSignalEngineConfig.signalB, b3VolLookback: 6 };
    // 4 points → every index < 6 → B3 must be NEUTRAL for all
    const msci = [100, 101, 102, 103];
    const gold = [50, 50, 50, 50];
    const dates = ['2020-01-01', '2020-02-01', '2020-03-01', '2020-04-01'];
    const res = calculateSignalB(msci, gold, dates, cfg);
    expect(res.history.every(h => h.b3Signal === 'NEUTRAL')).toBe(true);
  });

  it('B3 becomes ON/OFF only once enough returns exist', () => {
    const cfg = { ...defaultSignalEngineConfig.signalB, b3VolLookback: 3 };
    const msci = [100, 101, 102, 103, 104, 105, 106, 107];
    const gold = msci.map(() => 50);
    const dates = msci.map((_, i) => `2020-${String(i + 1).padStart(2, '0')}-01`);
    const res = calculateSignalB(msci, gold, dates, cfg);
    // indices < 3 NEUTRAL, index >= 3 resolved (low vol steady rise → ON)
    expect(res.history[0].b3Signal).toBe('NEUTRAL');
    expect(res.history[2].b3Signal).toBe('NEUTRAL');
    expect(['ON', 'OFF']).toContain(res.history[5].b3Signal);
  });
});

describe('requiredMonths — dynamic threshold', () => {
  it('matches max(requiredA, requiredB) for defaults', () => {
    // A = 10 + 2 - 1 = 11 ; B = max(10,10,6+1) + 2 - 1 = 11 ; max = 11
    expect(requiredMonths(defaultSignalEngineConfig)).toBe(11);
  });
  it('B dominates when lookback is large', () => {
    const cfg = { ...defaultSignalEngineConfig, signalB: { ...defaultSignalEngineConfig.signalB, b3VolLookback: 24 } };
    // B = max(10,10,25) + 2 - 1 = 26
    expect(requiredMonths(cfg)).toBe(26);
  });
});

describe('evaluateRegime — insufficient / off-by-one', () => {
  it('below threshold → insufficient, no signals', () => {
    const req = requiredMonths(defaultSignalEngineConfig); // 11
    const pairs: MonthlyPair[] = Array.from({ length: req - 1 }, (_, i) => ({
      month: `2020-${String(i + 1).padStart(2, '0')}`, msci: 100 + i, gold: 50,
    }));
    const ev = evaluateRegime(pairs, defaultSignalEngineConfig);
    expect(ev.dataStatus).toBe('insufficient');
    expect(ev.availableMonths).toBe(req - 1);
    expect(ev.finalRegime).toBe('UNDETERMINED');
    expect(ev.signalA).toBeNull();
  });
  it('exactly at threshold → engine runs (not insufficient)', () => {
    const req = requiredMonths(defaultSignalEngineConfig); // 11
    const pairs: MonthlyPair[] = Array.from({ length: req }, (_, i) => ({
      month: `2020-${String(i + 1).padStart(2, '0')}`, msci: 100 + i, gold: 50,
    }));
    const ev = evaluateRegime(pairs, defaultSignalEngineConfig);
    expect(ev.dataStatus).not.toBe('insufficient');
    expect(ev.signalA).not.toBeNull();
    expect(ev.asOfMonth).toBe(`${pairs[req - 1].month}-01`);
  });
});

describe('alignMonthlyPairs', () => {
  it('takes last observation per month and only months valid for both', () => {
    const msci: PricePoint[] = [
      { date: '2020-01-05', close: 1 }, { date: '2020-01-28', close: 2 }, // Jan → 2
      { date: '2020-02-15', close: 3 }, // Feb → 3
      { date: '2020-03-15', close: 9 }, // Mar (gold missing)
    ];
    const gold: PricePoint[] = [
      { date: '2020-01-20', close: 50 }, // Jan
      { date: '2020-02-10', close: 60 }, // Feb
    ];
    const pairs = alignMonthlyPairs(msci, gold, '2020-12');
    expect(pairs).toEqual([
      { month: '2020-01', msci: 2, gold: 50 },
      { month: '2020-02', msci: 3, gold: 60 },
    ]); // March excluded (no gold)
  });

  it('excludes the current month', () => {
    const msci: PricePoint[] = [{ date: '2026-06-30', close: 10 }, { date: '2026-07-15', close: 11 }];
    const gold: PricePoint[] = [{ date: '2026-06-30', close: 50 }, { date: '2026-07-15', close: 55 }];
    const pairs = alignMonthlyPairs(msci, gold, '2026-07');
    expect(pairs.map(p => p.month)).toEqual(['2026-06']); // July (current) excluded
  });
});

describe('configFromDb', () => {
  it('maps top-level decision_mode and nested signals', () => {
    const cfg = configFromDb({
      decision_mode: 'A_AND_B',
      signalA: { smaMonths: 10, bandPct: 0.015, confirmMonths: 2 },
      signalB: { b1SmaMonths: 10, b1BandPct: 0.01, b2SmaMonths: 10, b2BandPct: 0.01, b3VolLookback: 6, b3VolThreshold: 0.18, minVotesRequired: 2, confirmMonths: 2 },
    });
    expect(cfg.decision.mode).toBe('A_AND_B');
    expect(cfg.signalB.b3VolLookback).toBe(6);
    expect(requiredMonths(cfg)).toBe(11);
  });
});

describe('determinism & fingerprint', () => {
  it('same pairs → same fingerprint; a changed price → different', () => {
    const p1: MonthlyPair[] = [{ month: '2020-01', msci: 100, gold: 50 }];
    const p2: MonthlyPair[] = [{ month: '2020-01', msci: 101, gold: 50 }];
    expect(canonicalInputString(p1)).toBe(canonicalInputString(p1));
    expect(canonicalInputString(p1)).not.toBe(canonicalInputString(p2));
  });
  it('exposes an explicit engine version', () => {
    expect(typeof ENGINE_VERSION).toBe('string');
    expect(ENGINE_VERSION.length).toBeGreaterThan(0);
  });
});

describe('determined regime on a strong trend', () => {
  it('sustained MSCI outperformance vs flat gold → RISK_ON', () => {
    const n = 24;
    const pairs: MonthlyPair[] = Array.from({ length: n }, (_, i) => ({
      month: `20${20 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      msci: 100 * Math.pow(1.03, i), // steady rise
      gold: 50,
    }));
    const ev = evaluateRegime(pairs, defaultSignalEngineConfig);
    expect(ev.dataStatus).toBe('determined');
    expect(ev.finalRegime).toBe('RISK_ON');
  });
});
