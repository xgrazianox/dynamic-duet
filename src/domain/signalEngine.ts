/* =========================================================================
 * SIGNAL ENGINE — runtime-neutral, single source of truth (F3-C1).
 *
 * This file is the ONE canonical source. The React app imports it directly
 * (`@/domain/signalEngine`). The Deno Edge Function `evaluate_regime` imports a
 * GENERATED artifact (supabase/functions/_shared/engine.ts) produced from this
 * file by scripts/generate-edge-engine.sh and verified byte-for-byte by
 * scripts/test-utilities/engine-single-source.sh (fails closed on divergence).
 * ZERO imports on purpose so the generated artifact is valid under Deno too:
 * no browser/React/Node/Deno globals, only Math + plain data. Never hand-edit
 * the artifact — regenerate it; never add imports here.
 * ========================================================================= */

export const ENGINE_VERSION = 'engine-2026.07-f3';

// ---------- types ----------
export type Regime = 'RISK_ON' | 'RISK_OFF' | 'UNDETERMINED';
export type RawSignal = 'ON' | 'OFF' | 'NEUTRAL';
export type DecisionMode = 'USE_A' | 'USE_B' | 'A_AND_B' | 'A_OR_B' | 'A_PRIORITY';

export interface SignalAConfig { smaMonths: number; bandPct: number; confirmMonths: number; }
export interface SignalBConfig {
  confirmMonths: number; minVotesRequired: number;
  b1SmaMonths: number; b1BandPct: number;
  b2SmaMonths: number; b2BandPct: number;
  b3VolLookback: number; b3VolThreshold: number;
}
export interface DecisionLayerConfig { mode: DecisionMode; }
export interface SignalEngineConfig { signalA: SignalAConfig; signalB: SignalBConfig; decision: DecisionLayerConfig; }

export interface SignalADataPoint {
  date: string; ratio: number; sma: number | null;
  upperBand: number | null; lowerBand: number | null;
  rawSignal: RawSignal; confirmedRegime: Regime; reason: string;
}
export interface SignalAResult {
  currentRegime: Regime; rawSignal: RawSignal; ratio: number; sma: number;
  upperBand: number; lowerBand: number; confirmCount: number; reason: string;
  history: SignalADataPoint[];
}
export interface SignalBVote { b1: RawSignal; b2: RawSignal; b3: RawSignal; onCount: number; offCount: number; rawSignal: RawSignal; }
export interface SignalBDataPoint {
  date: string; b1Signal: RawSignal; b1Value: number; b2Signal: RawSignal; b2Value: number;
  b2Sma: number | null; b3Signal: RawSignal; b3Value: number; vote: SignalBVote;
  confirmedRegime: Regime; reason: string;
}
export interface SignalBResult { currentRegime: Regime; vote: SignalBVote; confirmCount: number; reason: string; history: SignalBDataPoint[]; }
export interface DecisionResult { finalRegime: Regime; regimeA: Regime; regimeB: Regime; hasConflict: boolean; reason: string; }
export interface SignalEngineResult { signalA: SignalAResult; signalB: SignalBResult; decision: DecisionResult; }

export const defaultSignalEngineConfig: SignalEngineConfig = {
  signalA: { smaMonths: 10, bandPct: 0.015, confirmMonths: 2 },
  signalB: {
    confirmMonths: 2, minVotesRequired: 2,
    b1SmaMonths: 10, b1BandPct: 0.01,
    b2SmaMonths: 10, b2BandPct: 0.01,
    b3VolLookback: 6, b3VolThreshold: 0.18,
  },
  decision: { mode: 'A_AND_B' },
};

// ---------- utilities ----------
const calculateSMA = (values: number[], period: number): number | null => {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};
const calculateReturns = (prices: number[]): number[] => {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  return returns;
};
const calculateVolatility = (returns: number[], annualize = true): number => {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.map(r => Math.pow(r - mean, 2)).reduce((a, b) => a + b, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  return annualize ? std * Math.sqrt(12) : std;
};

// ---------- Signal A: double confirmation MSCI/Gold ----------
export const calculateSignalA = (
  msciPrices: number[], goldPrices: number[], dates: string[],
  config: SignalAConfig = defaultSignalEngineConfig.signalA,
): SignalAResult => {
  const { smaMonths, bandPct, confirmMonths } = config;
  const ratios = msciPrices.map((msci, i) => msci / goldPrices[i]);
  const history: SignalADataPoint[] = [];
  let previousRegime: Regime = 'UNDETERMINED';
  let confirmCount = 0;

  for (let i = 0; i < ratios.length; i++) {
    const ratio = ratios[i];
    const sma = calculateSMA(ratios.slice(0, i + 1), smaMonths);
    let rawSignal: RawSignal = 'NEUTRAL';
    let upperBand: number | null = null;
    let lowerBand: number | null = null;
    let reason = '';
    if (sma !== null) {
      upperBand = sma * (1 + bandPct);
      lowerBand = sma * (1 - bandPct);
      if (ratio > upperBand) { rawSignal = 'ON'; reason = 'Ratio sopra banda superiore'; }
      else if (ratio < lowerBand) { rawSignal = 'OFF'; reason = 'Ratio sotto banda inferiore'; }
      else { rawSignal = 'NEUTRAL'; reason = 'Ratio in banda neutrale'; }
    } else { reason = 'Dati insufficienti per SMA'; }

    let confirmedRegime = previousRegime;
    if (i >= confirmMonths - 1) {
      const recent = history.slice(-(confirmMonths - 1)).map(h => h.rawSignal);
      recent.push(rawSignal);
      const allOn = recent.every(s => s === 'ON');
      const allOff = recent.every(s => s === 'OFF');
      if (allOn) { confirmedRegime = 'RISK_ON'; confirmCount = confirmMonths; reason = `${confirmMonths} conferme consecutive sopra banda → RISK-ON`; }
      else if (allOff) { confirmedRegime = 'RISK_OFF'; confirmCount = confirmMonths; reason = `${confirmMonths} conferme consecutive sotto banda → RISK-OFF`; }
      else {
        confirmCount = recent.filter(s => s === rawSignal).length;
        reason = previousRegime === 'UNDETERMINED' ? 'In attesa di conferma'
          : `Mantengo ${previousRegime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'} (${confirmCount}/${confirmMonths} conferme)`;
      }
    } else { reason = 'In attesa di dati sufficienti per conferma'; }

    history.push({ date: dates[i], ratio, sma, upperBand, lowerBand, rawSignal, confirmedRegime, reason });
    previousRegime = confirmedRegime;
  }

  const latest = history[history.length - 1];
  return {
    currentRegime: latest?.confirmedRegime || 'UNDETERMINED',
    rawSignal: latest?.rawSignal || 'NEUTRAL',
    ratio: latest?.ratio || 0, sma: latest?.sma || 0,
    upperBand: latest?.upperBand || 0, lowerBand: latest?.lowerBand || 0,
    confirmCount, reason: latest?.reason || '', history,
  };
};

// ---------- Signal B: 2-of-3 majority vote ----------
export const calculateSignalB = (
  msciPrices: number[], goldPrices: number[], dates: string[],
  config: SignalBConfig = defaultSignalEngineConfig.signalB,
): SignalBResult => {
  const { confirmMonths, minVotesRequired, b1SmaMonths, b1BandPct, b2SmaMonths, b2BandPct, b3VolLookback, b3VolThreshold } = config;
  const ratios = msciPrices.map((msci, i) => msci / goldPrices[i]);
  const ratioSmas = ratios.map((_, i) => calculateSMA(ratios.slice(0, i + 1), b1SmaMonths));
  const msciSmas = msciPrices.map((_, i) => calculateSMA(msciPrices.slice(0, i + 1), b2SmaMonths));
  const msciReturns = calculateReturns(msciPrices);

  const history: SignalBDataPoint[] = [];
  let previousRegime: Regime = 'UNDETERMINED';
  let confirmCount = 0;

  for (let i = 0; i < msciPrices.length; i++) {
    // B1: MSCI/Gold ratio trend
    let b1Signal: RawSignal = 'NEUTRAL';
    const b1Value = ratios[i];
    const ratioSma = ratioSmas[i];
    if (ratioSma !== null) {
      if (b1Value > ratioSma * (1 + b1BandPct)) b1Signal = 'ON';
      else if (b1Value < ratioSma * (1 - b1BandPct)) b1Signal = 'OFF';
    }
    // B2: MSCI equity trend
    let b2Signal: RawSignal = 'NEUTRAL';
    const b2Value = msciPrices[i];
    const b2Sma = msciSmas[i];
    if (b2Sma !== null) {
      if (b2Value > b2Sma * (1 + b2BandPct)) b2Signal = 'ON';
      else if (b2Value < b2Sma * (1 - b2BandPct)) b2Signal = 'OFF';
    }
    // B3: volatility filter — NEUTRAL until enough history (F3 fix: was 'ON').
    let b3Signal: RawSignal = 'NEUTRAL';
    let b3Value = 0;
    if (i >= b3VolLookback) {
      const recentReturns = msciReturns.slice(Math.max(0, i - b3VolLookback), i);
      b3Value = calculateVolatility(recentReturns);
      b3Signal = b3Value > b3VolThreshold ? 'OFF' : 'ON';
    }

    const signals = [b1Signal, b2Signal, b3Signal];
    let onCount = 0, offCount = 0;
    signals.forEach(s => { if (s === 'ON') onCount++; else if (s === 'OFF') offCount++; });
    let rawSignal: RawSignal = 'NEUTRAL';
    if (onCount >= minVotesRequired) rawSignal = 'ON';
    else if (offCount >= minVotesRequired) rawSignal = 'OFF';
    const vote: SignalBVote = { b1: b1Signal, b2: b2Signal, b3: b3Signal, onCount, offCount, rawSignal };

    let confirmedRegime = previousRegime;
    let reason = '';
    if (i >= confirmMonths - 1) {
      const recent = history.slice(-(confirmMonths - 1)).map(h => h.vote.rawSignal);
      recent.push(rawSignal);
      const allOn = recent.every(s => s === 'ON');
      const allOff = recent.every(s => s === 'OFF');
      if (allOn) { confirmedRegime = 'RISK_ON'; confirmCount = confirmMonths; reason = `Voto ${minVotesRequired}-su-3: ${onCount} ON, ${confirmMonths} conferme → RISK-ON`; }
      else if (allOff) { confirmedRegime = 'RISK_OFF'; confirmCount = confirmMonths; reason = `Voto ${minVotesRequired}-su-3: ${offCount} OFF, ${confirmMonths} conferme → RISK-OFF`; }
      else {
        confirmCount = recent.filter(s => s === rawSignal).length;
        reason = previousRegime === 'UNDETERMINED' ? `Voto inconcludente (${onCount} ON, ${offCount} OFF)`
          : `Mantengo ${previousRegime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'} (${confirmCount}/${confirmMonths})`;
      }
    } else { reason = 'In attesa di dati sufficienti'; }

    history.push({ date: dates[i], b1Signal, b1Value, b2Signal, b2Value, b2Sma, b3Signal, b3Value, vote, confirmedRegime, reason });
    previousRegime = confirmedRegime;
  }

  const latest = history[history.length - 1];
  return {
    currentRegime: latest?.confirmedRegime || 'UNDETERMINED',
    vote: latest?.vote || { b1: 'NEUTRAL', b2: 'NEUTRAL', b3: 'NEUTRAL', onCount: 0, offCount: 0, rawSignal: 'NEUTRAL' },
    confirmCount, reason: latest?.reason || '', history,
  };
};

// ---------- decision layer ----------
export const calculateDecision = (
  regimeA: Regime, regimeB: Regime,
  config: DecisionLayerConfig = defaultSignalEngineConfig.decision,
): DecisionResult => {
  const { mode } = config;
  let finalRegime: Regime = 'UNDETERMINED';
  let reason = '';
  const hasConflict = regimeA !== regimeB && regimeA !== 'UNDETERMINED' && regimeB !== 'UNDETERMINED';
  switch (mode) {
    case 'USE_A': finalRegime = regimeA; reason = `Usa Sistema A`; break;
    case 'USE_B': finalRegime = regimeB; reason = `Usa Sistema B`; break;
    case 'A_AND_B':
      if (regimeA === 'RISK_ON' && regimeB === 'RISK_ON') { finalRegime = 'RISK_ON'; reason = 'A+B concordano: entrambi RISK-ON'; }
      else if (regimeA === 'RISK_OFF' || regimeB === 'RISK_OFF') { finalRegime = 'RISK_OFF'; reason = hasConflict ? 'Conflitto A vs B → priorità difensiva: RISK-OFF' : 'Almeno un sistema indica RISK-OFF'; }
      else { finalRegime = 'UNDETERMINED'; reason = 'Almeno un sistema non determinato'; }
      break;
    case 'A_OR_B':
      if (regimeA === 'RISK_ON' || regimeB === 'RISK_ON') { finalRegime = 'RISK_ON'; reason = 'Almeno un sistema indica RISK-ON'; }
      else if (regimeA === 'RISK_OFF' && regimeB === 'RISK_OFF') { finalRegime = 'RISK_OFF'; reason = 'Entrambi i sistemi indicano RISK-OFF'; }
      else { finalRegime = 'UNDETERMINED'; reason = 'Nessun sistema determinato'; }
      break;
    case 'A_PRIORITY':
      if (regimeA !== 'UNDETERMINED') { finalRegime = regimeA; reason = hasConflict ? 'Conflitto → priorità Sistema A' : 'Sistema A'; }
      else { finalRegime = regimeB; reason = 'Sistema A non determinato → uso B'; }
      break;
  }
  return { finalRegime, regimeA, regimeB, hasConflict, reason };
};

export const runSignalEngine = (
  msciPrices: number[], goldPrices: number[], dates: string[],
  config: SignalEngineConfig = defaultSignalEngineConfig,
): SignalEngineResult => {
  const signalA = calculateSignalA(msciPrices, goldPrices, dates, config.signalA);
  const signalB = calculateSignalB(msciPrices, goldPrices, dates, config.signalB);
  const decision = calculateDecision(signalA.currentRegime, signalB.currentRegime, config.decision);
  return { signalA, signalB, decision };
};

/* =========================================================================
 * F3 orchestration: aligned monthly pairs, dynamic threshold, evaluation
 * ========================================================================= */
export interface PricePoint { date: string; close: number; } // date = 'YYYY-MM-DD'
export interface MonthlyPair { month: string; msci: number; gold: number; } // month = 'YYYY-MM'
export type DataStatus = 'insufficient' | 'undetermined' | 'determined';

export interface RegimeEvaluation {
  dataStatus: DataStatus;
  requiredMonths: number;
  availableMonths: number;
  asOfMonth: string | null;      // last concluded month used (YYYY-MM-01), null if none
  regimeA: Regime;
  regimeB: Regime;
  finalRegime: Regime;           // 'UNDETERMINED' unless determined
  signalA: SignalAResult | null;
  signalB: SignalBResult | null;
  decision: DecisionResult | null;
  pairs: MonthlyPair[];
}

const monthOf = (isoDate: string): string => isoDate.slice(0, 7); // YYYY-MM

/** Last observation of each driver per calendar month; only months valid for
 * BOTH drivers; the given current month (YYYY-MM) is always excluded. Sorted asc. */
export const alignMonthlyPairs = (
  msci: PricePoint[], gold: PricePoint[], currentMonth: string,
): MonthlyPair[] => {
  const lastByMonth = (pts: PricePoint[]): Map<string, number> => {
    const best = new Map<string, string>(); // month -> best date
    const val = new Map<string, number>();
    for (const p of pts) {
      const m = monthOf(p.date);
      if (m >= currentMonth) continue; // exclude current (and any future) month
      const prev = best.get(m);
      if (prev === undefined || p.date > prev) { best.set(m, p.date); val.set(m, p.close); }
    }
    return val;
  };
  const mv = lastByMonth(msci);
  const gv = lastByMonth(gold);
  const months: string[] = [];
  for (const m of mv.keys()) if (gv.has(m)) months.push(m);
  months.sort();
  return months.map(m => ({ month: m, msci: mv.get(m) as number, gold: gv.get(m) as number }));
};

export const requiredMonths = (config: SignalEngineConfig): number => {
  const a = config.signalA.smaMonths + config.signalA.confirmMonths - 1;
  const b = Math.max(config.signalB.b1SmaMonths, config.signalB.b2SmaMonths, config.signalB.b3VolLookback + 1)
    + config.signalB.confirmMonths - 1;
  return Math.max(a, b);
};

export interface EngineConfigInput {
  decision_mode?: DecisionMode | string;
  signalA?: Partial<SignalAConfig>;
  signalB?: Partial<SignalBConfig>;
}
/** Adapt the DB engine_config jsonb (decision_mode at top level) to SignalEngineConfig. */
export const configFromDb = (engineConfig: EngineConfigInput | null | undefined): SignalEngineConfig => {
  const a = engineConfig?.signalA ?? {};
  const b = engineConfig?.signalB ?? {};
  return {
    signalA: {
      smaMonths: a.smaMonths ?? defaultSignalEngineConfig.signalA.smaMonths,
      bandPct: a.bandPct ?? defaultSignalEngineConfig.signalA.bandPct,
      confirmMonths: a.confirmMonths ?? defaultSignalEngineConfig.signalA.confirmMonths,
    },
    signalB: {
      confirmMonths: b.confirmMonths ?? defaultSignalEngineConfig.signalB.confirmMonths,
      minVotesRequired: b.minVotesRequired ?? defaultSignalEngineConfig.signalB.minVotesRequired,
      b1SmaMonths: b.b1SmaMonths ?? defaultSignalEngineConfig.signalB.b1SmaMonths,
      b1BandPct: b.b1BandPct ?? defaultSignalEngineConfig.signalB.b1BandPct,
      b2SmaMonths: b.b2SmaMonths ?? defaultSignalEngineConfig.signalB.b2SmaMonths,
      b2BandPct: b.b2BandPct ?? defaultSignalEngineConfig.signalB.b2BandPct,
      b3VolLookback: b.b3VolLookback ?? defaultSignalEngineConfig.signalB.b3VolLookback,
      b3VolThreshold: b.b3VolThreshold ?? defaultSignalEngineConfig.signalB.b3VolThreshold,
    },
    decision: { mode: (engineConfig?.decision_mode ?? defaultSignalEngineConfig.decision.mode) as DecisionMode },
  };
};

/** Full evaluation from aligned pairs. Applies the dynamic threshold and the
 * UNDETERMINED/insufficient semantics (F3 point 8). Deterministic & pure. */
export const evaluateRegime = (pairs: MonthlyPair[], config: SignalEngineConfig): RegimeEvaluation => {
  const required = requiredMonths(config);
  const available = pairs.length;
  const asOfMonth = available > 0 ? `${pairs[available - 1].month}-01` : null;

  if (available < required) {
    return {
      dataStatus: 'insufficient', requiredMonths: required, availableMonths: available,
      asOfMonth, regimeA: 'UNDETERMINED', regimeB: 'UNDETERMINED', finalRegime: 'UNDETERMINED',
      signalA: null, signalB: null, decision: null, pairs,
    };
  }

  const msci = pairs.map(p => p.msci);
  const gold = pairs.map(p => p.gold);
  const dates = pairs.map(p => `${p.month}-01`);
  const signalA = calculateSignalA(msci, gold, dates, config.signalA);
  const signalB = calculateSignalB(msci, gold, dates, config.signalB);
  const decision = calculateDecision(signalA.currentRegime, signalB.currentRegime, config.decision);

  return {
    dataStatus: decision.finalRegime === 'UNDETERMINED' ? 'undetermined' : 'determined',
    requiredMonths: required, availableMonths: available, asOfMonth,
    regimeA: signalA.currentRegime, regimeB: signalB.currentRegime, finalRegime: decision.finalRegime,
    signalA, signalB, decision, pairs,
  };
};

/** Stable canonical string of the aligned inputs (for input_fingerprint). */
export const canonicalInputString = (pairs: MonthlyPair[]): string =>
  pairs.map(p => `${p.month}:${p.msci}:${p.gold}`).join('|');

/** Stable canonical string of the effective config (for config_hash). */
export const canonicalConfigString = (config: SignalEngineConfig): string => {
  const a = config.signalA, b = config.signalB;
  return [
    `mode=${config.decision.mode}`,
    `A=${a.smaMonths},${a.bandPct},${a.confirmMonths}`,
    `B=${b.b1SmaMonths},${b.b1BandPct},${b.b2SmaMonths},${b.b2BandPct},${b.b3VolLookback},${b.b3VolThreshold},${b.minVotesRequired},${b.confirmMonths}`,
    `v=${ENGINE_VERSION}`,
  ].join(';');
};
