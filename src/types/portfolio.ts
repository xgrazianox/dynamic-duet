// Core types for the portfolio allocation strategy

export type Regime = 'RISK_ON' | 'RISK_OFF' | 'UNDETERMINED';

export type SleeveCategory = 'CORE' | 'FACTOR' | 'THEME' | 'HEDGE' | 'CASH';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertCode = 
  | 'REGIME_SWITCH'
  | 'THEME_NOT_ELIGIBLE'
  | 'THEMES_DUPLICATE'
  | 'REBALANCE_NEEDED'
  | 'PRICE_UPDATE_FAILED'
  | 'NOT_ENOUGH_DATA'
  | 'NOT_ENOUGH_DATA_THEME'
  | 'THEME_OVERWEIGHT_TAKE_PROFIT'
  | 'INSUFFICIENT_CASH_FOR_TILT';

export type PriceSource = 'AUTO_API' | 'MANUAL';

export type TransactionType = 'BUY' | 'SELL';

export interface Instrument {
  id: string;
  name: string;
  isin?: string;
  ticker: string;
  exchange?: string;
  provider: string;
  currency: 'EUR' | 'USD' | 'CHF';
  category: SleeveCategory;
  sleeveKey: string;
  isActive: boolean;
}

export interface PricePoint {
  id: string;
  instrumentId: string;
  date: string; // YYYY-MM-01
  closePrice: number;
  source: PriceSource;
  createdAt: string;
}

export interface PortfolioPosition {
  id: string;
  instrumentId: string;
  sleeveKey: string;
  asOfDate: string;
  quantity?: number;
  marketValueEur: number;
  averageBuyPrice?: number;
  note?: string;
}

export interface TargetAllocation {
  id: string;
  regime: Regime;
  sleeveKey: string;
  baseWeight: number;
  minWeight?: number;
  maxWeight?: number;
  enabled: boolean;
}

export interface StrategyState {
  id: string;
  asOfDate: string;
  msciGoldRatio: number;
  sma10Ratio: number;
  regime: Regime;
  theme1Selected?: string;
  theme2Selected?: string;
  theme1Eligible: boolean;
  theme2Eligible: boolean;
  appliedThemeBonusTotal: number;
  notes?: string;
}

export interface Alert {
  id: string;
  asOfDate: string;
  severity: AlertSeverity;
  code: AlertCode;
  message: string;
  resolved: boolean;
}

export interface TradeSuggestion {
  id: string;
  asOfDate: string;
  sleeveKey: string;
  sleeveName: string;
  currentWeight: number;
  targetWeight: number;
  deltaWeight: number;
  suggestedTradeEur: number;
  rationale: string;
}

export interface StrategyConfig {
  smaMonths: number;
  underperformanceThreshold: number;
  themeBonusPercent: number;
  maxThemes: number;
  takeProfitThreshold: number;
  tradeRoundingAmount: number;
}

export interface SleeveInfo {
  key: string;
  name: string;
  category: SleeveCategory;
  description?: string;
}

// Transaction for buy/sell operations
export interface Transaction {
  id: string;
  instrumentId: string;
  sleeveKey: string;
  type: TransactionType;
  date: string;
  quantity: number;
  pricePerUnit: number;
  totalValueEur: number;
  fees?: number;
  notes?: string;
  createdAt: string;
}

// Closed position for P&L tracking
export interface ClosedPosition {
  id: string;
  instrumentId: string;
  sleeveKey: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  investedAmount: number;
  soldAmount: number;
  profitLossEur: number;
  profitLossPercent: number;
  holdingDays: number;
}

// Sleeve definitions
export const SLEEVES: Record<string, SleeveInfo> = {
  WORLD_CORE: { key: 'WORLD_CORE', name: 'MSCI World Core', category: 'CORE' },
  WORLD_QUALITY: { key: 'WORLD_QUALITY', name: 'World Quality', category: 'FACTOR' },
  WORLD_VALUE: { key: 'WORLD_VALUE', name: 'World Value', category: 'FACTOR' },
  NASDAQ_AI: { key: 'NASDAQ_AI', name: 'Nasdaq / AI & Semis', category: 'THEME' },
  DEFENSE: { key: 'DEFENSE', name: 'Difesa & Aerospazio', category: 'THEME' },
  UTILITIES_GRID: { key: 'UTILITIES_GRID', name: 'Utilities & Grid', category: 'THEME' },
  CRITICAL_METALS: { key: 'CRITICAL_METALS', name: 'Metalli Critici & Rame', category: 'THEME' },
  URANIUM_NUCLEAR: { key: 'URANIUM_NUCLEAR', name: 'Uranio & Nucleare', category: 'THEME' },
  CLEAN_ENERGY: { key: 'CLEAN_ENERGY', name: 'Clean Energy', category: 'THEME' },
  GOLD: { key: 'GOLD', name: 'Oro', category: 'HEDGE' },
  ESTR_CASH: { key: 'ESTR_CASH', name: 'ESTR / Cash', category: 'CASH' },
};
