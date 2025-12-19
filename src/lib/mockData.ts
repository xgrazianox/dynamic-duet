import { 
  Instrument, 
  PricePoint, 
  PortfolioPosition, 
  TargetAllocation, 
  StrategyState, 
  Alert, 
  TradeSuggestion,
  StrategyConfig,
  Regime,
  Transaction,
  ClosedPosition
} from '@/types/portfolio';

// Generate 24 months of mock price data
const generateMonthlyPrices = (basePrice: number, volatility: number, months: number = 24): number[] => {
  const prices: number[] = [basePrice];
  for (let i = 1; i < months; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility * prices[i - 1];
    prices.push(Math.max(prices[i - 1] + change, basePrice * 0.5));
  }
  return prices;
};

const getMonthDate = (monthsAgo: number): string => {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

const getDateString = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

// Mock instruments
export const mockInstruments: Instrument[] = [
  { id: '1', name: 'iShares Core MSCI World', ticker: 'IWDA.AS', currency: 'EUR', category: 'CORE', sleeveKey: 'WORLD_CORE', provider: 'Yahoo Finance', isActive: true },
  { id: '2', name: 'iShares MSCI World Quality', ticker: 'IWQU.L', currency: 'EUR', category: 'FACTOR', sleeveKey: 'WORLD_QUALITY', provider: 'Yahoo Finance', isActive: true },
  { id: '3', name: 'iShares Edge MSCI World Value', ticker: 'IWVL.L', currency: 'EUR', category: 'FACTOR', sleeveKey: 'WORLD_VALUE', provider: 'Yahoo Finance', isActive: true },
  { id: '4', name: 'Invesco EQQQ Nasdaq-100', ticker: 'EQQQ.L', currency: 'EUR', category: 'THEME', sleeveKey: 'NASDAQ_AI', provider: 'Yahoo Finance', isActive: true },
  { id: '5', name: 'VanEck Defense', ticker: 'DFNS.DE', currency: 'EUR', category: 'THEME', sleeveKey: 'DEFENSE', provider: 'Yahoo Finance', isActive: true },
  { id: '6', name: 'iShares Global Utilities', ticker: 'IUIT.L', currency: 'EUR', category: 'THEME', sleeveKey: 'UTILITIES_GRID', provider: 'Yahoo Finance', isActive: true },
  { id: '7', name: 'Global X Copper Miners', ticker: 'COPX', currency: 'USD', category: 'THEME', sleeveKey: 'CRITICAL_METALS', provider: 'Yahoo Finance', isActive: true },
  { id: '8', name: 'Global X Uranium', ticker: 'URA', currency: 'USD', category: 'THEME', sleeveKey: 'URANIUM_NUCLEAR', provider: 'Yahoo Finance', isActive: true },
  { id: '9', name: 'iShares Global Clean Energy', ticker: 'INRG.L', currency: 'EUR', category: 'THEME', sleeveKey: 'CLEAN_ENERGY', provider: 'Yahoo Finance', isActive: true },
  { id: '10', name: 'Xetra-Gold ETC', ticker: '4GLD.DE', currency: 'EUR', category: 'HEDGE', sleeveKey: 'GOLD', provider: 'Yahoo Finance', isActive: true },
  { id: '11', name: 'Xtrackers EUR Overnight Rate', ticker: 'XEON.DE', currency: 'EUR', category: 'CASH', sleeveKey: 'ESTR_CASH', provider: 'Yahoo Finance', isActive: true },
];

// Generate mock price history
const msciPrices = generateMonthlyPrices(85, 0.03, 24);
const goldPrices = generateMonthlyPrices(55, 0.025, 24);

export const mockPricePoints: PricePoint[] = [];
mockInstruments.forEach((instrument, idx) => {
  const basePrices = idx === 0 ? msciPrices : 
                     idx === 9 ? goldPrices : 
                     generateMonthlyPrices(50 + Math.random() * 100, 0.04, 24);
  
  basePrices.forEach((price, monthIdx) => {
    mockPricePoints.push({
      id: `${instrument.id}-${monthIdx}`,
      instrumentId: instrument.id,
      date: getMonthDate(23 - monthIdx),
      closePrice: Math.round(price * 100) / 100,
      source: 'AUTO_API',
      createdAt: new Date().toISOString(),
    });
  });
});

// Calculate MSCI/Gold ratio and SMA

const calculateRatioAndSMA = (): { currentRatio: number; sma10: number; regime: Regime } => {
  const ratios: number[] = [];
  for (let i = 0; i < 24; i++) {
    ratios.push(msciPrices[i] / goldPrices[i]);
  }
  
  const currentRatio = ratios[ratios.length - 1];
  const sma10 = ratios.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const regime: Regime = currentRatio > sma10 ? 'RISK_ON' : 'RISK_OFF';
  
  return { currentRatio, sma10, regime };
};

const { currentRatio, sma10, regime } = calculateRatioAndSMA();

// Mock portfolio positions (current holdings)
export const mockPositions: PortfolioPosition[] = [
  { id: '1', instrumentId: '1', sleeveKey: 'WORLD_CORE', asOfDate: getMonthDate(0), marketValueEur: 35200, averageBuyPrice: 82.50 },
  { id: '2', instrumentId: '2', sleeveKey: 'WORLD_QUALITY', asOfDate: getMonthDate(0), marketValueEur: 7800, averageBuyPrice: 48.20 },
  { id: '3', instrumentId: '3', sleeveKey: 'WORLD_VALUE', asOfDate: getMonthDate(0), marketValueEur: 7200, averageBuyPrice: 35.80 },
  { id: '4', instrumentId: '4', sleeveKey: 'NASDAQ_AI', asOfDate: getMonthDate(0), marketValueEur: 9500, averageBuyPrice: 320.00 },
  { id: '5', instrumentId: '5', sleeveKey: 'DEFENSE', asOfDate: getMonthDate(0), marketValueEur: 4800, averageBuyPrice: 22.50 },
  { id: '6', instrumentId: '6', sleeveKey: 'UTILITIES_GRID', asOfDate: getMonthDate(0), marketValueEur: 4500, averageBuyPrice: 28.40 },
  { id: '7', instrumentId: '7', sleeveKey: 'CRITICAL_METALS', asOfDate: getMonthDate(0), marketValueEur: 5800, averageBuyPrice: 38.90 },
  { id: '8', instrumentId: '8', sleeveKey: 'URANIUM_NUCLEAR', asOfDate: getMonthDate(0), marketValueEur: 4200, averageBuyPrice: 26.30 },
  { id: '9', instrumentId: '9', sleeveKey: 'CLEAN_ENERGY', asOfDate: getMonthDate(0), marketValueEur: 3500, averageBuyPrice: 8.50 },
  { id: '10', instrumentId: '10', sleeveKey: 'GOLD', asOfDate: getMonthDate(0), marketValueEur: 10500, averageBuyPrice: 58.20 },
  { id: '11', instrumentId: '11', sleeveKey: 'ESTR_CASH', asOfDate: getMonthDate(0), marketValueEur: 7000, averageBuyPrice: 100.00 },
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
  regime: regime,
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
    message: `Regime cambiato a ${regime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'}: Ratio MSCI/Gold (${currentRatio.toFixed(2)}) ${regime === 'RISK_ON' ? '>' : '<'} SMA10 (${sma10.toFixed(2)})`,
    resolved: false 
  },
  { 
    id: '2', 
    asOfDate: getMonthDate(0), 
    severity: 'WARNING', 
    code: 'REBALANCE_NEEDED', 
    message: 'Deviazione dal target >5% rilevata su alcuni sleeve. Ribilanciamento consigliato.',
    resolved: false 
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
  regime: 'RISK_ON' | 'RISK_OFF'
): TradeSuggestion[] => {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValueEur, 0);
  const activeTargets = regime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;
  
  const suggestions: TradeSuggestion[] = [];
  
  activeTargets.forEach(target => {
    const position = positions.find(p => p.sleeveKey === target.sleeveKey);
    const currentValue = position?.marketValueEur || 0;
    const currentWeight = currentValue / totalValue;
    const targetWeight = target.baseWeight;
    const deltaWeight = targetWeight - currentWeight;
    const suggestedTrade = deltaWeight * totalValue;
    
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

const safeRegime: 'RISK_ON' | 'RISK_OFF' = regime === 'UNDETERMINED' ? 'RISK_ON' : regime;
export const mockTradeSuggestions = calculateTradeSuggestions(mockPositions, mockTargetsRiskOn, safeRegime);

// Historical ratio data for chart
export const ratioHistory = msciPrices.map((msci, i) => ({
  date: getMonthDate(23 - i),
  ratio: Math.round((msci / goldPrices[i]) * 1000) / 1000,
  sma10: i >= 9 
    ? Math.round((msciPrices.slice(i - 9, i + 1).reduce((a, b, j) => a + b / goldPrices[i - 9 + j], 0) / 10) * 1000) / 1000
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
