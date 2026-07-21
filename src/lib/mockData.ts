import { 
  Instrument, 
  PricePoint, 
  PortfolioPosition, 
  TargetAllocation, 
  StrategyState, 
  Alert, 
  TradeSuggestion,
  StrategyConfig,
  Transaction,
  ClosedPosition
} from '@/types/portfolio';
import {
  SHARED_DATES,
  SHARED_MSCI_PRICES,
  SHARED_GOLD_PRICES,
  SHARED_CURRENT_RATIO,
  SHARED_SMA10,
  generateSeededPrices,
} from '@/lib/sharedPrices';

// Build a YYYY-MM-01 string N months ago without setMonth overflow bugs.
const getMonthDate = (monthsAgo: number): string => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const getDateString = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

// Mock instruments
export const mockInstruments: Instrument[] = [
  { id: '1', name: 'iShares Core MSCI World', ticker: 'IWDA.AS', currency: 'EUR', category: 'CORE', sleeveKey: 'WORLD_CORE', provider: 'yahoo', isActive: true },
  { id: '2', name: 'iShares MSCI World Quality', ticker: 'IWQU.L', currency: 'EUR', category: 'FACTOR', sleeveKey: 'WORLD_QUALITY', provider: 'yahoo', isActive: true },
  { id: '3', name: 'iShares Edge MSCI World Value', ticker: 'IWVL.L', currency: 'EUR', category: 'FACTOR', sleeveKey: 'WORLD_VALUE', provider: 'yahoo', isActive: true },
  { id: '4', name: 'Invesco EQQQ Nasdaq-100', ticker: 'EQQQ.L', currency: 'EUR', category: 'THEME', sleeveKey: 'NASDAQ_AI', provider: 'yahoo', isActive: true },
  { id: '5', name: 'VanEck Defense', ticker: 'DFNS.DE', currency: 'EUR', category: 'THEME', sleeveKey: 'DEFENSE', provider: 'yahoo', isActive: true },
  { id: '6', name: 'iShares Global Utilities', ticker: 'IUIT.L', currency: 'EUR', category: 'THEME', sleeveKey: 'UTILITIES_GRID', provider: 'yahoo', isActive: true },
  { id: '7', name: 'Global X Copper Miners', ticker: 'COPX', currency: 'USD', category: 'THEME', sleeveKey: 'CRITICAL_METALS', provider: 'yahoo', isActive: true },
  { id: '8', name: 'Global X Uranium', ticker: 'URA', currency: 'USD', category: 'THEME', sleeveKey: 'URANIUM_NUCLEAR', provider: 'yahoo', isActive: true },
  { id: '9', name: 'iShares Global Clean Energy', ticker: 'INRG.L', currency: 'EUR', category: 'THEME', sleeveKey: 'CLEAN_ENERGY', provider: 'yahoo', isActive: true },
  { id: '10', name: 'Xetra-Gold ETC', ticker: '4GLD.DE', currency: 'EUR', category: 'HEDGE', sleeveKey: 'GOLD', provider: 'yahoo', isActive: true },
  { id: '11', name: 'Xtrackers EUR Overnight Rate', ticker: 'XEON.DE', currency: 'EUR', category: 'CASH', sleeveKey: 'ESTR_CASH', provider: 'yahoo', isActive: true },
];

// FX rate EUR/USD used to convert USD-denominated prices into EUR portfolio values.
export const FX_EURUSD = 1.08;

// Price history — MSCI (id '1') and Gold (id '10') use the SHARED deterministic
// series that also feeds the Signal Engine; other instruments use their own
// deterministic seeds so they don't shuffle on every reload.
export const mockPricePoints: PricePoint[] = [];
mockInstruments.forEach((instrument, idx) => {
  let basePrices: number[];
  if (instrument.id === '1') {
    basePrices = SHARED_MSCI_PRICES;
  } else if (instrument.id === '10') {
    basePrices = SHARED_GOLD_PRICES;
  } else {
    // Deterministic per-instrument series (seed derived from id)
    const seed = 1000 + idx * 137;
    const base = 50 + ((idx * 17) % 100);
    basePrices = generateSeededPrices(seed, base, 0.04, 24);
  }

  basePrices.forEach((price, monthIdx) => {
    mockPricePoints.push({
      id: `${instrument.id}-${monthIdx}`,
      instrumentId: instrument.id,
      date: SHARED_DATES[monthIdx],
      closePrice: Math.round(price * 100) / 100,
      source: 'AUTO_API',
      createdAt: new Date().toISOString(),
    });
  });
});

// Snapshot values derived from the SHARED series so the Dati & Prezzi page,
// the RegimeCard and the alerts all quote the same numbers. The regime itself
// is NOT used as the source of truth for pages (they read useSignalEngine().finalRegime);
// this snapshot is only a best-effort label for static mock data.
const currentRatio = SHARED_CURRENT_RATIO;
const sma10 = SHARED_SMA10;
const snapshotRegime: 'RISK_ON' | 'RISK_OFF' = currentRatio > sma10 ? 'RISK_ON' : 'RISK_OFF';

// Mock portfolio positions (current holdings)
export const mockPositions: PortfolioPosition[] = [
  { id: '1', instrumentId: '1', sleeveKey: 'WORLD_CORE', asOfDate: getMonthDate(0), marketValueEur: 35200, averageBuyPrice: 82.50, quantity: 420, lastPrice: 83.81 },
  { id: '2', instrumentId: '2', sleeveKey: 'WORLD_QUALITY', asOfDate: getMonthDate(0), marketValueEur: 7800, averageBuyPrice: 48.20, quantity: 160, lastPrice: 48.75 },
  { id: '3', instrumentId: '3', sleeveKey: 'WORLD_VALUE', asOfDate: getMonthDate(0), marketValueEur: 7200, averageBuyPrice: 35.80, quantity: 200, lastPrice: 36.00 },
  { id: '4', instrumentId: '4', sleeveKey: 'NASDAQ_AI', asOfDate: getMonthDate(0), marketValueEur: 9500, averageBuyPrice: 320.00, quantity: 30, lastPrice: 316.67 },
  { id: '5', instrumentId: '5', sleeveKey: 'DEFENSE', asOfDate: getMonthDate(0), marketValueEur: 4800, averageBuyPrice: 22.50, quantity: 210, lastPrice: 22.86 },
  { id: '6', instrumentId: '6', sleeveKey: 'UTILITIES_GRID', asOfDate: getMonthDate(0), marketValueEur: 4500, averageBuyPrice: 28.40, quantity: 155, lastPrice: 29.03 },
  // COPX/URA sono in USD: marketValueEur = quantity × lastPriceUSD / FX_EURUSD.
  { id: '7', instrumentId: '7', sleeveKey: 'CRITICAL_METALS', asOfDate: getMonthDate(0), marketValueEur: Math.round((145 * 40.00 / FX_EURUSD) * 100) / 100, averageBuyPrice: 38.90, quantity: 145, lastPrice: 40.00 },
  { id: '8', instrumentId: '8', sleeveKey: 'URANIUM_NUCLEAR', asOfDate: getMonthDate(0), marketValueEur: Math.round((158 * 26.58 / FX_EURUSD) * 100) / 100, averageBuyPrice: 26.30, quantity: 158, lastPrice: 26.58 },
  // CLEAN_ENERGY: dopo BUY 500 @ 9.20 e SELL 150, i 350 residui hanno costo medio 9.20.
  { id: '9', instrumentId: '9', sleeveKey: 'CLEAN_ENERGY', asOfDate: getMonthDate(0), marketValueEur: 3500, averageBuyPrice: 9.20, quantity: 350, lastPrice: 10.00 },
  { id: '10', instrumentId: '10', sleeveKey: 'GOLD', asOfDate: getMonthDate(0), marketValueEur: 10500, averageBuyPrice: 58.20, quantity: 180, lastPrice: 58.33 },
  { id: '11', instrumentId: '11', sleeveKey: 'ESTR_CASH', asOfDate: getMonthDate(0), marketValueEur: 7000, averageBuyPrice: 100.00, quantity: 70, lastPrice: 100.00 },
];

// Target allocations RISK-ON
export const mockTargetsRiskOn: TargetAllocation[] = [
  { id: '1', regime: 'RISK_ON', sleeveKey: 'WORLD_CORE', baseWeight: 0.35, enabled: true },
  { id: '2', regime: 'RISK_ON', sleeveKey: 'WORLD_QUALITY', baseWeight: 0.075, enabled: true },
  { id: '3', regime: 'RISK_ON', sleeveKey: 'WORLD_VALUE', baseWeight: 0.075, enabled: true },
  { id: '4', regime: 'RISK_ON', sleeveKey: 'NASDAQ_AI', baseWeight: 0.08, enabled: true },
  { id: '5', regime: 'RISK_ON', sleeveKey: 'DEFENSE', baseWeight: 0.05, enabled: true },
  { id: '6', regime: 'RISK_ON', sleeveKey: 'UTILITIES_GRID', baseWeight: 0.05, enabled: true },
  { id: '7', regime: 'RISK_ON', sleeveKey: 'CRITICAL_METALS', baseWeight: 0.06, enabled: true },
  { id: '8', regime: 'RISK_ON', sleeveKey: 'URANIUM_NUCLEAR', baseWeight: 0.04, enabled: true },
  { id: '9', regime: 'RISK_ON', sleeveKey: 'CLEAN_ENERGY', baseWeight: 0.04, enabled: true },
  { id: '10', regime: 'RISK_ON', sleeveKey: 'GOLD', baseWeight: 0.10, enabled: true },
  { id: '11', regime: 'RISK_ON', sleeveKey: 'ESTR_CASH', baseWeight: 0.08, enabled: true },
];

// Target allocations RISK-OFF
export const mockTargetsRiskOff: TargetAllocation[] = [
  { id: '12', regime: 'RISK_OFF', sleeveKey: 'GOLD', baseWeight: 0.25, enabled: true },
  { id: '13', regime: 'RISK_OFF', sleeveKey: 'ESTR_CASH', baseWeight: 0.35, enabled: true },
  { id: '14', regime: 'RISK_OFF', sleeveKey: 'WORLD_QUALITY', baseWeight: 0.125, enabled: true },
  { id: '15', regime: 'RISK_OFF', sleeveKey: 'WORLD_VALUE', baseWeight: 0.125, enabled: true },
  { id: '16', regime: 'RISK_OFF', sleeveKey: 'UTILITIES_GRID', baseWeight: 0.15, enabled: true },
];

// Current strategy state
export const mockStrategyState: StrategyState = {
  id: '1',
  asOfDate: getMonthDate(0),
  msciGoldRatio: Math.round(currentRatio * 1000) / 1000,
  sma10Ratio: Math.round(sma10 * 1000) / 1000,
  regime: snapshotRegime,
  theme1Selected: 'CLEAN_ENERGY',
  theme2Selected: undefined,
  theme1Eligible: true,
  theme2Eligible: false,
  appliedThemeBonusTotal: 0.02,
  notes: 'Clean Energy eleggibile per sottoperformance 12m',
};

// Alerts
export const mockAlerts: Alert[] = [
  { 
    id: '1', 
    asOfDate: getMonthDate(0), 
    severity: 'INFO', 
    code: 'REGIME_SWITCH', 
    message: `Regime cambiato a ${snapshotRegime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'}: Ratio MSCI/Gold (${currentRatio.toFixed(2)}) ${snapshotRegime === 'RISK_ON' ? '>' : '<'} SMA10 (${sma10.toFixed(2)})`,
    resolved: false,
    status: 'OPEN',
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    targetEntity: { panel: 'decision' }
  },
  { 
    id: '3', 
    asOfDate: getMonthDate(0), 
    severity: 'CRITICAL', 
    code: 'PRICE_UPDATE_FAILED', 
    message: 'Impossibile aggiornare prezzo per COPX (Critical Metals). Ultimo prezzo: 2 giorni fa.',
    resolved: false,
    status: 'OPEN',
    resolutionType: 'OPEN_PRICE_UPDATE',
    targetPage: 'INPUTS',
    targetEntity: { instrumentId: '7', fieldToFocus: 'prices' }
  },
  { 
    id: '5', 
    asOfDate: getMonthDate(0), 
    severity: 'INFO', 
    code: 'THEME_NOT_ELIGIBLE', 
    message: 'Clean Energy non più eleggibile: trend negativo sotto SMA10.',
    resolved: true,
    status: 'RESOLVED',
    resolutionType: 'OPEN_THEME_SELECTOR',
    targetPage: 'SIGNALS',
    targetEntity: { themeSlot: 'THEME1' }
  },
];

// Default strategy config
export const defaultStrategyConfig: StrategyConfig = {
  smaMonths: 10,
  underperformanceThreshold: 0.15,
  themeBonusPercent: 0.02,
  maxThemes: 2,
  takeProfitThreshold: 0.30,
  tradeRoundingAmount: 50,
};

// Mock transactions
export const mockTransactions: Transaction[] = [
  { id: 't1', instrumentId: '1', sleeveKey: 'WORLD_CORE', type: 'BUY', date: getDateString(180), quantity: 200, pricePerUnit: 80.50, totalValueEur: 16100, createdAt: new Date().toISOString() },
  { id: 't2', instrumentId: '1', sleeveKey: 'WORLD_CORE', type: 'BUY', date: getDateString(90), quantity: 220, pricePerUnit: 84.50, totalValueEur: 18590, createdAt: new Date().toISOString() },
  { id: 't3', instrumentId: '4', sleeveKey: 'NASDAQ_AI', type: 'BUY', date: getDateString(150), quantity: 30, pricePerUnit: 305.00, totalValueEur: 9150, createdAt: new Date().toISOString() },
  { id: 't4', instrumentId: '10', sleeveKey: 'GOLD', type: 'BUY', date: getDateString(200), quantity: 100, pricePerUnit: 52.00, totalValueEur: 5200, createdAt: new Date().toISOString() },
  { id: 't5', instrumentId: '10', sleeveKey: 'GOLD', type: 'BUY', date: getDateString(60), quantity: 80, pricePerUnit: 58.75, totalValueEur: 4700, createdAt: new Date().toISOString() },
  { id: 't6', instrumentId: '9', sleeveKey: 'CLEAN_ENERGY', type: 'BUY', date: getDateString(120), quantity: 500, pricePerUnit: 9.20, totalValueEur: 4600, createdAt: new Date().toISOString() },
  { id: 't7', instrumentId: '9', sleeveKey: 'CLEAN_ENERGY', type: 'SELL', date: getDateString(30), quantity: 150, pricePerUnit: 7.80, totalValueEur: 1170, createdAt: new Date().toISOString() },
  // INIT snapshots for positions without explicit BUY history (opening balances)
  { id: 't-init-2', instrumentId: '2', sleeveKey: 'WORLD_QUALITY', type: 'INIT', date: getDateString(365), quantity: 160, pricePerUnit: 48.20, totalValueEur: 7712, notes: 'Saldo iniziale', createdAt: new Date().toISOString() },
  { id: 't-init-3', instrumentId: '3', sleeveKey: 'WORLD_VALUE', type: 'INIT', date: getDateString(365), quantity: 200, pricePerUnit: 35.80, totalValueEur: 7160, notes: 'Saldo iniziale', createdAt: new Date().toISOString() },
  { id: 't-init-5', instrumentId: '5', sleeveKey: 'DEFENSE', type: 'INIT', date: getDateString(365), quantity: 210, pricePerUnit: 22.50, totalValueEur: 4725, notes: 'Saldo iniziale', createdAt: new Date().toISOString() },
  { id: 't-init-6', instrumentId: '6', sleeveKey: 'UTILITIES_GRID', type: 'INIT', date: getDateString(365), quantity: 155, pricePerUnit: 28.40, totalValueEur: 4402, notes: 'Saldo iniziale', createdAt: new Date().toISOString() },
  { id: 't-init-7', instrumentId: '7', sleeveKey: 'CRITICAL_METALS', type: 'INIT', date: getDateString(365), quantity: 145, pricePerUnit: 38.90, totalValueEur: Math.round((145 * 38.90 / FX_EURUSD) * 100) / 100, fxRateUsed: FX_EURUSD, notes: `Saldo iniziale (USD @${FX_EURUSD})`, createdAt: new Date().toISOString() },
  { id: 't-init-8', instrumentId: '8', sleeveKey: 'URANIUM_NUCLEAR', type: 'INIT', date: getDateString(365), quantity: 158, pricePerUnit: 26.30, totalValueEur: Math.round((158 * 26.30 / FX_EURUSD) * 100) / 100, fxRateUsed: FX_EURUSD, notes: `Saldo iniziale (USD @${FX_EURUSD})`, createdAt: new Date().toISOString() },
  { id: 't-init-11', instrumentId: '11', sleeveKey: 'ESTR_CASH', type: 'INIT', date: getDateString(365), quantity: 70, pricePerUnit: 100.00, totalValueEur: 7000, notes: 'Saldo iniziale', createdAt: new Date().toISOString() },
];

// Mock closed positions (P&L)
export const mockClosedPositions: ClosedPosition[] = [
  { 
    id: 'cp1', 
    instrumentId: '9', 
    sleeveKey: 'CLEAN_ENERGY', 
    buyDate: getDateString(120), 
    sellDate: getDateString(30), 
    buyPrice: 9.20, 
    sellPrice: 7.80, 
    quantity: 150, 
    investedAmount: 1380, 
    soldAmount: 1170, 
    profitLossEur: -210, 
    profitLossPercent: -15.22, 
    holdingDays: 90 
  },
  { 
    id: 'cp2', 
    instrumentId: '5', 
    sleeveKey: 'DEFENSE', 
    buyDate: getDateString(300), 
    sellDate: getDateString(100), 
    buyPrice: 18.50, 
    sellPrice: 24.20, 
    quantity: 100, 
    investedAmount: 1850, 
    soldAmount: 2420, 
    profitLossEur: 570, 
    profitLossPercent: 30.81, 
    holdingDays: 200 
  },
  { 
    id: 'cp3', 
    instrumentId: '7', 
    sleeveKey: 'CRITICAL_METALS', 
    buyDate: getDateString(250), 
    sellDate: getDateString(80), 
    buyPrice: 32.00, 
    sellPrice: 41.50, 
    quantity: 50, 
    investedAmount: 1600, 
    soldAmount: 2075, 
    profitLossEur: 475, 
    profitLossPercent: 29.69, 
    holdingDays: 170 
  },
];

// Helper to calculate trade suggestions
export const calculateTradeSuggestions = (
  positions: PortfolioPosition[],
  targets: TargetAllocation[],
  _regime?: 'RISK_ON' | 'RISK_OFF'
): TradeSuggestion[] => {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValueEur, 0);

  const suggestions: TradeSuggestion[] = [];

  targets.forEach(target => {
    const position = positions.find(p => p.sleeveKey === target.sleeveKey);
    const currentValue = position?.marketValueEur || 0;
    const currentWeight = currentValue / totalValue;
    const targetWeight = target.baseWeight;
    // Convention: delta = current − target (positive ⇒ sovrappeso).
    const deltaWeight = currentWeight - targetWeight;
    // Trade suggerito = riporta a target: −delta × totalValue (positivo ⇒ COMPRA).
    const suggestedTrade = -deltaWeight * totalValue;

    if (Math.abs(deltaWeight) > 0.005) {
      suggestions.push({
        id: `trade-${target.sleeveKey}`,
        asOfDate: getMonthDate(0),
        sleeveKey: target.sleeveKey,
        sleeveName: target.sleeveKey.replace(/_/g, ' '),
        currentWeight,
        targetWeight,
        deltaWeight,
        suggestedTradeEur: Math.round(suggestedTrade / 50) * 50,
        rationale: suggestedTrade > 0 ? 'Sottopeso vs target' : 'Sovrappeso vs target',
      });
    }
  });

  return suggestions.sort((a, b) => Math.abs(b.suggestedTradeEur) - Math.abs(a.suggestedTradeEur));
};

export const mockTradeSuggestions = calculateTradeSuggestions(mockPositions, mockTargetsRiskOn);

// Historical ratio data for chart (uses the shared series)
export const ratioHistory = SHARED_MSCI_PRICES.map((msci, i) => ({
  date: SHARED_DATES[i],
  ratio: Math.round((msci / SHARED_GOLD_PRICES[i]) * 1000) / 1000,
  sma10: i >= 9
    ? Math.round((SHARED_MSCI_PRICES.slice(i - 9, i + 1).reduce((a, b, j) => a + b / SHARED_GOLD_PRICES[i - 9 + j], 0) / 10) * 1000) / 1000
    : null,
}));

// Helper to calculate P&L summary
export const calculatePLSummary = (closedPositions: ClosedPosition[]) => {
  const totalPL = closedPositions.reduce((sum, cp) => sum + cp.profitLossEur, 0);
  const totalInvested = closedPositions.reduce((sum, cp) => sum + cp.investedAmount, 0);
  const winningTrades = closedPositions.filter(cp => cp.profitLossEur > 0);
  const losingTrades = closedPositions.filter(cp => cp.profitLossEur <= 0);
  
  return {
    totalPL,
    totalInvested,
    totalPLPercent: totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0,
    avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.profitLossEur, 0) / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.profitLossEur, 0) / losingTrades.length : 0,
  };
};
