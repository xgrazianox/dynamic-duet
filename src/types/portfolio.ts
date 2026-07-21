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
  | 'INSUFFICIENT_CASH_FOR_TILT'
  | 'A_REGIME_SWITCH'
  | 'A_NEUTRAL_BAND'
  | 'B_REGIME_SWITCH'
  | 'B_INCONCLUSIVE'
  | 'REGIME_CONFLICT'
  | 'PORTFOLIO_MODE_CHANGED'
  | 'TILT_DISABLED_IN_RISKOFF';

export type PriceSource = 'AUTO_API' | 'MANUAL';

export type TransactionType = 'BUY' | 'SELL' | 'CLOSE' | 'INIT' | 'EDIT';

export type InstrumentType = 'STOCK' | 'ETF' | 'ETC' | 'FUND' | 'CASH' | 'OTHER';

// Signal Engine Types
export type RawSignal = 'ON' | 'OFF' | 'NEUTRAL';

export type DecisionMode = 'USE_A' | 'USE_B' | 'A_AND_B' | 'A_OR_B' | 'A_PRIORITY';

// Signal A - Double Confirmation on MSCI/Gold Ratio
export interface SignalAConfig {
  smaMonths: number;           // default 10
  bandPct: number;             // default 0.015 (1.5%)
  confirmMonths: number;       // default 2
}

export interface SignalADataPoint {
  date: string;
  ratio: number;
  sma: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  rawSignal: RawSignal;
  confirmedRegime: Regime;
  reason: string;
}

export interface SignalAResult {
  currentRegime: Regime;
  rawSignal: RawSignal;
  ratio: number;
  sma: number;
  upperBand: number;
  lowerBand: number;
  confirmCount: number;
  reason: string;
  history: SignalADataPoint[];
}

// Signal B - 2-out-of-3 Majority Vote
export interface SignalBConfig {
  confirmMonths: number;       // default 2
  minVotesRequired: number;    // default 2
  // Sub-signal configs
  b1SmaMonths: number;         // default 10 (MSCI/Gold ratio SMA)
  b1BandPct: number;           // default 0.01 (±1% band on ratio)
  b2SmaMonths: number;         // default 10 (MSCI trend)
  b2BandPct: number;           // default 0.01 (1%)
  b3VolLookback: number;       // default 6 months
  b3VolThreshold: number;      // default 0.18 (18%)
}

export interface SignalBVote {
  b1: RawSignal;  // MSCI/Gold ratio trend
  b2: RawSignal;  // MSCI equity trend
  b3: RawSignal;  // Volatility filter
  onCount: number;
  offCount: number;
  rawSignal: RawSignal;
}

export interface SignalBDataPoint {
  date: string;
  b1Signal: RawSignal;
  b1Value: number;  // ratio
  b2Signal: RawSignal;
  b2Value: number;  // MSCI price
  b2Sma: number | null;
  b3Signal: RawSignal;
  b3Value: number;  // volatility
  vote: SignalBVote;
  confirmedRegime: Regime;
  reason: string;
}

export interface SignalBResult {
  currentRegime: Regime;
  vote: SignalBVote;
  confirmCount: number;
  reason: string;
  history: SignalBDataPoint[];
}

// Decision Layer
export interface DecisionLayerConfig {
  mode: DecisionMode;
}

export interface DecisionResult {
  finalRegime: Regime;
  regimeA: Regime;
  regimeB: Regime;
  hasConflict: boolean;
  reason: string;
}

// Combined Signal Engine Config
export interface SignalEngineConfig {
  signalA: SignalAConfig;
  signalB: SignalBConfig;
  decision: DecisionLayerConfig;
}

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
  instrumentType?: InstrumentType;
  yahooSymbol?: string;
  exchangeCode?: string;
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
  costCurrency?: 'EUR' | 'USD' | 'CHF';
  isClosed?: boolean;
  lastPrice?: number;
  lastPriceDate?: string;
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

// Alert resolution types - indicates what action is needed
export type AlertResolutionType = 
  | 'NAVIGATE_ONLY'
  | 'OPEN_TRADE_MODAL_BUY'
  | 'OPEN_TRADE_MODAL_SELL'
  | 'OPEN_TRADE_MODAL_CLOSE'
  | 'OPEN_POSITION_EDIT'
  | 'OPEN_SETTINGS'
  | 'OPEN_SIGNALS_VIEW'
  | 'OPEN_PRICE_UPDATE'
  | 'OPEN_THEME_SELECTOR';

// Alert status
export type AlertStatus = 'OPEN' | 'RESOLVED';

// Target page for navigation
export type AlertTargetPage = 'PORTFOLIO' | 'SIGNALS' | 'INPUTS' | 'SETTINGS' | 'ALERTS';

// Target entity for deep-linking
export interface AlertTargetEntity {
  instrumentId?: string;
  sleeveKey?: string;
  rowId?: string;
  themeSlot?: 'THEME1' | 'THEME2';
  fieldToFocus?: string;
  panel?: string;
  month?: string;
}

// Prefill payload for modals
export interface AlertPrefillPayload {
  suggestedAmountEur?: number;
  suggestedQuantity?: number;
  suggestedAction?: 'BUY' | 'SELL' | 'CLOSE' | 'EDIT';
  notesTemplate?: string;
}

export interface Alert {
  id: string;
  asOfDate: string;
  severity: AlertSeverity;
  code: AlertCode;
  message: string;
  resolved: boolean;
  status: AlertStatus;
  resolutionType: AlertResolutionType;
  targetPage: AlertTargetPage;
  targetEntity?: AlertTargetEntity;
  prefillPayload?: AlertPrefillPayload;
  resolvedAt?: string;
  resolvedBy?: string;
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
  fxRateUsed?: number;
}

// Yahoo search result
export interface YahooSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: InstrumentType;
  currency: 'EUR' | 'USD' | 'CHF';
  lastPrice?: number;
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

// Default Signal Engine Configuration
export const defaultSignalEngineConfig: SignalEngineConfig = {
  signalA: {
    smaMonths: 10,
    bandPct: 0.015,
    confirmMonths: 2,
  },
  signalB: {
    confirmMonths: 2,
    minVotesRequired: 2,
    b1SmaMonths: 10,
    b1BandPct: 0.01,
    b2SmaMonths: 10,
    b2BandPct: 0.01,
    b3VolLookback: 6,
    b3VolThreshold: 0.18,
  },
  decision: {
    mode: 'A_AND_B',
  },
};
