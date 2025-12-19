import { 
  Regime, 
  RawSignal, 
  SignalAConfig, 
  SignalADataPoint, 
  SignalAResult,
  SignalBConfig,
  SignalBDataPoint,
  SignalBVote,
  SignalBResult,
  DecisionLayerConfig,
  DecisionResult,
  SignalEngineConfig,
  defaultSignalEngineConfig
} from '@/types/portfolio';

// ============ UTILITIES ============

const calculateSMA = (values: number[], period: number): number | null => {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

const calculateReturns = (prices: number[]): number[] => {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
};

const calculateVolatility = (returns: number[], annualize = true): number => {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  return annualize ? std * Math.sqrt(12) : std; // Annualize for monthly data
};

// ============ SIGNAL A: Double Confirmation MSCI/Gold ============

export const calculateSignalA = (
  msciPrices: number[],
  goldPrices: number[],
  dates: string[],
  config: SignalAConfig = defaultSignalEngineConfig.signalA
): SignalAResult => {
  const { smaMonths, bandPct, confirmMonths } = config;
  
  // Calculate ratios
  const ratios = msciPrices.map((msci, i) => msci / goldPrices[i]);
  
  const history: SignalADataPoint[] = [];
  let previousRegime: Regime = 'UNDETERMINED';
  let confirmCount = 0;
  
  for (let i = 0; i < ratios.length; i++) {
    const ratio = ratios[i];
    const historicalRatios = ratios.slice(0, i + 1);
    const sma = calculateSMA(historicalRatios, smaMonths);
    
    let rawSignal: RawSignal = 'NEUTRAL';
    let upperBand: number | null = null;
    let lowerBand: number | null = null;
    let reason = '';
    
    if (sma !== null) {
      upperBand = sma * (1 + bandPct);
      lowerBand = sma * (1 - bandPct);
      
      if (ratio > upperBand) {
        rawSignal = 'ON';
        reason = 'Ratio sopra banda superiore';
      } else if (ratio < lowerBand) {
        rawSignal = 'OFF';
        reason = 'Ratio sotto banda inferiore';
      } else {
        rawSignal = 'NEUTRAL';
        reason = 'Ratio in banda neutrale';
      }
    } else {
      reason = 'Dati insufficienti per SMA';
    }
    
    // Double confirmation logic
    let confirmedRegime = previousRegime;
    
    if (i >= confirmMonths - 1) {
      const recentRawSignals = history.slice(-(confirmMonths - 1)).map(h => h.rawSignal);
      recentRawSignals.push(rawSignal);
      
      const allOn = recentRawSignals.every(s => s === 'ON');
      const allOff = recentRawSignals.every(s => s === 'OFF');
      
      if (allOn) {
        confirmedRegime = 'RISK_ON';
        confirmCount = confirmMonths;
        reason = `${confirmMonths} conferme consecutive sopra banda → RISK-ON`;
      } else if (allOff) {
        confirmedRegime = 'RISK_OFF';
        confirmCount = confirmMonths;
        reason = `${confirmMonths} conferme consecutive sotto banda → RISK-OFF`;
      } else {
        // Sticky: maintain previous regime
        confirmCount = recentRawSignals.filter(s => s === rawSignal).length;
        reason = previousRegime === 'UNDETERMINED' 
          ? 'In attesa di conferma' 
          : `Mantengo ${previousRegime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'} (${confirmCount}/${confirmMonths} conferme)`;
      }
    } else {
      reason = 'In attesa di dati sufficienti per conferma';
    }
    
    history.push({
      date: dates[i],
      ratio,
      sma,
      upperBand,
      lowerBand,
      rawSignal,
      confirmedRegime,
      reason,
    });
    
    previousRegime = confirmedRegime;
  }
  
  const latest = history[history.length - 1];
  
  return {
    currentRegime: latest?.confirmedRegime || 'UNDETERMINED',
    rawSignal: latest?.rawSignal || 'NEUTRAL',
    ratio: latest?.ratio || 0,
    sma: latest?.sma || 0,
    upperBand: latest?.upperBand || 0,
    lowerBand: latest?.lowerBand || 0,
    confirmCount,
    reason: latest?.reason || '',
    history,
  };
};

// ============ SIGNAL B: 2-out-of-3 Majority Vote ============

export const calculateSignalB = (
  msciPrices: number[],
  goldPrices: number[],
  dates: string[],
  config: SignalBConfig = defaultSignalEngineConfig.signalB
): SignalBResult => {
  const { 
    confirmMonths, 
    neutralHandling, 
    minVotesRequired,
    b2SmaMonths,
    b2BandPct,
    b3VolLookback,
    b3VolThreshold 
  } = config;
  
  const ratios = msciPrices.map((msci, i) => msci / goldPrices[i]);
  const ratioSmas = ratios.map((_, i) => calculateSMA(ratios.slice(0, i + 1), 10));
  
  const msciSmas = msciPrices.map((_, i) => calculateSMA(msciPrices.slice(0, i + 1), b2SmaMonths));
  const msciReturns = calculateReturns(msciPrices);
  
  const history: SignalBDataPoint[] = [];
  let previousRegime: Regime = 'UNDETERMINED';
  let confirmCount = 0;
  
  for (let i = 0; i < msciPrices.length; i++) {
    // B1: MSCI/Gold ratio trend (simplified - using ratio vs SMA without band)
    let b1Signal: RawSignal = 'NEUTRAL';
    const b1Value = ratios[i];
    const ratioSma = ratioSmas[i];
    if (ratioSma !== null) {
      if (b1Value > ratioSma * 1.01) b1Signal = 'ON';
      else if (b1Value < ratioSma * 0.99) b1Signal = 'OFF';
    }
    
    // B2: MSCI equity trend
    let b2Signal: RawSignal = 'NEUTRAL';
    const b2Value = msciPrices[i];
    const b2Sma = msciSmas[i];
    if (b2Sma !== null) {
      const upperBand = b2Sma * (1 + b2BandPct);
      const lowerBand = b2Sma * (1 - b2BandPct);
      if (b2Value > upperBand) b2Signal = 'ON';
      else if (b2Value < lowerBand) b2Signal = 'OFF';
    }
    
    // B3: Volatility filter
    let b3Signal: RawSignal = 'ON'; // Default to ON (low vol)
    let b3Value = 0;
    if (i >= b3VolLookback) {
      const recentReturns = msciReturns.slice(Math.max(0, i - b3VolLookback), i);
      b3Value = calculateVolatility(recentReturns);
      b3Signal = b3Value > b3VolThreshold ? 'OFF' : 'ON';
    }
    
    // Count votes
    const signals = [b1Signal, b2Signal, b3Signal];
    let onCount = 0;
    let offCount = 0;
    
    signals.forEach(s => {
      if (s === 'ON') onCount++;
      else if (s === 'OFF') offCount++;
      // If neutralHandling is 'EXCLUDE', neutral signals are not counted
    });
    
    let rawSignal: RawSignal = 'NEUTRAL';
    if (onCount >= minVotesRequired) rawSignal = 'ON';
    else if (offCount >= minVotesRequired) rawSignal = 'OFF';
    
    const vote: SignalBVote = {
      b1: b1Signal,
      b2: b2Signal,
      b3: b3Signal,
      onCount,
      offCount,
      rawSignal,
    };
    
    // Double confirmation for B
    let confirmedRegime = previousRegime;
    let reason = '';
    
    if (i >= confirmMonths - 1) {
      const recentRawSignals = history.slice(-(confirmMonths - 1)).map(h => h.vote.rawSignal);
      recentRawSignals.push(rawSignal);
      
      const allOn = recentRawSignals.every(s => s === 'ON');
      const allOff = recentRawSignals.every(s => s === 'OFF');
      
      if (allOn) {
        confirmedRegime = 'RISK_ON';
        confirmCount = confirmMonths;
        reason = `Voto 2-su-3: ${onCount} ON, ${confirmMonths} conferme → RISK-ON`;
      } else if (allOff) {
        confirmedRegime = 'RISK_OFF';
        confirmCount = confirmMonths;
        reason = `Voto 2-su-3: ${offCount} OFF, ${confirmMonths} conferme → RISK-OFF`;
      } else {
        confirmCount = recentRawSignals.filter(s => s === rawSignal).length;
        reason = previousRegime === 'UNDETERMINED'
          ? `Voto inconcludente (${onCount} ON, ${offCount} OFF)`
          : `Mantengo ${previousRegime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'} (${confirmCount}/${confirmMonths})`;
      }
    } else {
      reason = 'In attesa di dati sufficienti';
    }
    
    history.push({
      date: dates[i],
      b1Signal,
      b1Value,
      b2Signal,
      b2Value,
      b2Sma,
      b3Signal,
      b3Value,
      vote,
      confirmedRegime,
      reason,
    });
    
    previousRegime = confirmedRegime;
  }
  
  const latest = history[history.length - 1];
  
  return {
    currentRegime: latest?.confirmedRegime || 'UNDETERMINED',
    vote: latest?.vote || { b1: 'NEUTRAL', b2: 'NEUTRAL', b3: 'NEUTRAL', onCount: 0, offCount: 0, rawSignal: 'NEUTRAL' },
    confirmCount,
    reason: latest?.reason || '',
    history,
  };
};

// ============ DECISION LAYER ============

export const calculateDecision = (
  regimeA: Regime,
  regimeB: Regime,
  config: DecisionLayerConfig = defaultSignalEngineConfig.decision
): DecisionResult => {
  const { mode } = config;
  
  let finalRegime: Regime = 'UNDETERMINED';
  let reason = '';
  const hasConflict = regimeA !== regimeB && regimeA !== 'UNDETERMINED' && regimeB !== 'UNDETERMINED';
  
  switch (mode) {
    case 'USE_A':
      finalRegime = regimeA;
      reason = `Usa Sistema A: ${regimeA === 'RISK_ON' ? 'RISK-ON' : regimeA === 'RISK_OFF' ? 'RISK-OFF' : 'Non determinato'}`;
      break;
      
    case 'USE_B':
      finalRegime = regimeB;
      reason = `Usa Sistema B: ${regimeB === 'RISK_ON' ? 'RISK-ON' : regimeB === 'RISK_OFF' ? 'RISK-OFF' : 'Non determinato'}`;
      break;
      
    case 'A_AND_B':
      // Conservative: both must agree for RISK_ON, otherwise RISK_OFF
      if (regimeA === 'RISK_ON' && regimeB === 'RISK_ON') {
        finalRegime = 'RISK_ON';
        reason = 'A+B concordano: entrambi RISK-ON';
      } else if (regimeA === 'RISK_OFF' || regimeB === 'RISK_OFF') {
        finalRegime = 'RISK_OFF';
        reason = hasConflict 
          ? `Conflitto A vs B → priorità difensiva: RISK-OFF`
          : 'Almeno un sistema indica RISK-OFF';
      } else {
        finalRegime = 'UNDETERMINED';
        reason = 'Almeno un sistema non determinato';
      }
      break;
      
    case 'A_OR_B':
      // Aggressive: RISK_ON if either agrees
      if (regimeA === 'RISK_ON' || regimeB === 'RISK_ON') {
        finalRegime = 'RISK_ON';
        reason = 'Almeno un sistema indica RISK-ON';
      } else if (regimeA === 'RISK_OFF' && regimeB === 'RISK_OFF') {
        finalRegime = 'RISK_OFF';
        reason = 'Entrambi i sistemi indicano RISK-OFF';
      } else {
        finalRegime = 'UNDETERMINED';
        reason = 'Nessun sistema determinato';
      }
      break;
      
    case 'A_PRIORITY':
      // A has priority, B is tiebreaker only when A is undetermined
      if (regimeA !== 'UNDETERMINED') {
        finalRegime = regimeA;
        reason = hasConflict 
          ? `Conflitto → priorità Sistema A: ${regimeA === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'}`
          : `Sistema A: ${regimeA === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'}`;
      } else {
        finalRegime = regimeB;
        reason = `Sistema A non determinato → uso B: ${regimeB === 'RISK_ON' ? 'RISK-ON' : regimeB === 'RISK_OFF' ? 'RISK-OFF' : 'Non determinato'}`;
      }
      break;
  }
  
  return {
    finalRegime,
    regimeA,
    regimeB,
    hasConflict,
    reason,
  };
};

// ============ FULL ENGINE ============

export interface SignalEngineResult {
  signalA: SignalAResult;
  signalB: SignalBResult;
  decision: DecisionResult;
}

export const runSignalEngine = (
  msciPrices: number[],
  goldPrices: number[],
  dates: string[],
  config: SignalEngineConfig = defaultSignalEngineConfig
): SignalEngineResult => {
  const signalA = calculateSignalA(msciPrices, goldPrices, dates, config.signalA);
  const signalB = calculateSignalB(msciPrices, goldPrices, dates, config.signalB);
  const decision = calculateDecision(signalA.currentRegime, signalB.currentRegime, config.decision);
  
  return { signalA, signalB, decision };
};
