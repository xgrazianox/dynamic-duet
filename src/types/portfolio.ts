// F6-r2.1 — ridotto ai SOLI tipi ancora consumati (alertRouting/deep-link).
// I tipi mock legacy sono stati eliminati insieme ai componenti morti.

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

export type AlertStatus = 'OPEN' | 'RESOLVED';

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

export type AlertTargetPage = 'PORTFOLIO' | 'SIGNALS' | 'INPUTS' | 'SETTINGS' | 'ALERTS';

export interface AlertTargetEntity {
  instrumentId?: string;
  sleeveKey?: string;
  rowId?: string;
  themeSlot?: 'THEME1' | 'THEME2';
  fieldToFocus?: string;
  panel?: string;
  month?: string;
}

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
