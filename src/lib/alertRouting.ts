import { Alert, AlertCode, AlertResolutionType, AlertTargetPage, AlertTargetEntity, AlertPrefillPayload } from '@/types/portfolio';

// Mapping of alert codes to their resolution metadata
export interface AlertRoutingConfig {
  resolutionType: AlertResolutionType;
  targetPage: AlertTargetPage;
  getTargetEntity?: (alert: Alert) => AlertTargetEntity;
  getPrefillPayload?: (alert: Alert, context?: any) => AlertPrefillPayload;
  description: string;
  actionLabel: string;
}

export const ALERT_ROUTING_MAP: Record<AlertCode, AlertRoutingConfig> = {
  // Rebalancing alerts
  REBALANCE_NEEDED: {
    resolutionType: 'NAVIGATE_ONLY',
    targetPage: 'PORTFOLIO',
    description: 'Ribilanciamento necessario per allineare al target',
    actionLabel: 'Vai al Portafoglio',
  },
  THEME_OVERWEIGHT_TAKE_PROFIT: {
    resolutionType: 'OPEN_TRADE_MODAL_SELL',
    targetPage: 'PORTFOLIO',
    description: 'Tema sovrappeso, considera take profit',
    actionLabel: 'Vendi',
  },

  // Regime alerts
  REGIME_SWITCH: {
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    getTargetEntity: () => ({ panel: 'decision' }),
    description: 'Il regime è cambiato, verifica i segnali',
    actionLabel: 'Vai ai Segnali',
  },
  A_REGIME_SWITCH: {
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    getTargetEntity: () => ({ panel: 'signalA' }),
    description: 'Segnale A ha cambiato regime',
    actionLabel: 'Vai a Signal A',
  },
  B_REGIME_SWITCH: {
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    getTargetEntity: () => ({ panel: 'signalB' }),
    description: 'Segnale B ha cambiato regime',
    actionLabel: 'Vai a Signal B',
  },
  REGIME_CONFLICT: {
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    getTargetEntity: () => ({ panel: 'decision' }),
    description: 'Conflitto tra Signal A e Signal B',
    actionLabel: 'Vai ai Segnali',
  },
  A_NEUTRAL_BAND: {
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    getTargetEntity: () => ({ panel: 'signalA' }),
    description: 'Signal A in banda neutra',
    actionLabel: 'Vai a Signal A',
  },
  B_INCONCLUSIVE: {
    resolutionType: 'OPEN_SIGNALS_VIEW',
    targetPage: 'SIGNALS',
    getTargetEntity: () => ({ panel: 'signalB' }),
    description: 'Signal B inconclusivo',
    actionLabel: 'Vai a Signal B',
  },

  // Price alerts
  PRICE_UPDATE_FAILED: {
    resolutionType: 'OPEN_PRICE_UPDATE',
    targetPage: 'INPUTS',
    getTargetEntity: () => ({ fieldToFocus: 'prices' }),
    description: 'Aggiornamento prezzi fallito',
    actionLabel: 'Aggiorna Prezzi',
  },
  NOT_ENOUGH_DATA: {
    resolutionType: 'OPEN_PRICE_UPDATE',
    targetPage: 'INPUTS',
    description: 'Dati insufficienti per il calcolo',
    actionLabel: 'Vai agli Input',
  },
  NOT_ENOUGH_DATA_THEME: {
    resolutionType: 'OPEN_THEME_SELECTOR',
    targetPage: 'INPUTS',
    description: 'Dati tema insufficienti',
    actionLabel: 'Vai agli Input',
  },

  // Theme alerts
  THEME_NOT_ELIGIBLE: {
    resolutionType: 'OPEN_THEME_SELECTOR',
    targetPage: 'SIGNALS',
    getTargetEntity: (alert) => {
      const match = alert.message.match(/Theme(\d)/);
      return { themeSlot: match ? `THEME${match[1]}` as 'THEME1' | 'THEME2' : 'THEME1' };
    },
    description: 'Tema non eleggibile, seleziona alternativa',
    actionLabel: 'Seleziona Tema',
  },
  THEMES_DUPLICATE: {
    resolutionType: 'OPEN_THEME_SELECTOR',
    targetPage: 'SIGNALS',
    description: 'Temi duplicati, seleziona uno diverso',
    actionLabel: 'Seleziona Tema',
  },

  // Config alerts
  INSUFFICIENT_CASH_FOR_TILT: {
    resolutionType: 'OPEN_SETTINGS',
    targetPage: 'SETTINGS',
    getTargetEntity: () => ({ fieldToFocus: 'cash' }),
    description: 'Cash insufficiente per applicare il tilt',
    actionLabel: 'Vai alle Impostazioni',
  },
  PORTFOLIO_MODE_CHANGED: {
    resolutionType: 'NAVIGATE_ONLY',
    targetPage: 'PORTFOLIO',
    description: 'Modalità portafoglio cambiata',
    actionLabel: 'Vai al Portafoglio',
  },
  TILT_DISABLED_IN_RISKOFF: {
    resolutionType: 'OPEN_SETTINGS',
    targetPage: 'SETTINGS',
    description: 'Tilt disabilitato in Risk-Off',
    actionLabel: 'Vai alle Impostazioni',
  },
};

// Build navigation URL for an alert
export function buildAlertNavigationUrl(alert: Alert): string {
  const config = ALERT_ROUTING_MAP[alert.code];
  if (!config) return '/';

  const pageMap: Record<AlertTargetPage, string> = {
    PORTFOLIO: '/portfolio',
    SIGNALS: '/signals',
    INPUTS: '/inputs',
    SETTINGS: '/settings',
    ALERTS: '/alerts',
  };

  const basePath = pageMap[config.targetPage];
  const params = new URLSearchParams();

  // Add alert ID for tracking
  params.set('alertId', alert.id);

  // Add action based on resolution type
  if (config.resolutionType === 'OPEN_TRADE_MODAL_BUY') {
    params.set('action', 'buy');
  } else if (config.resolutionType === 'OPEN_TRADE_MODAL_SELL') {
    params.set('action', 'sell');
  } else if (config.resolutionType === 'OPEN_TRADE_MODAL_CLOSE') {
    params.set('action', 'close');
  }

  // Add target entity params
  const entity = alert.targetEntity || (config.getTargetEntity ? config.getTargetEntity(alert) : undefined);
  if (entity) {
    if (entity.instrumentId) params.set('instrumentId', entity.instrumentId);
    if (entity.sleeveKey) params.set('sleeveKey', entity.sleeveKey);
    if (entity.panel) params.set('panel', entity.panel);
    if (entity.fieldToFocus) params.set('focus', entity.fieldToFocus);
    if (entity.themeSlot) params.set('themeSlot', entity.themeSlot);
  }

  // Add prefill params
  if (alert.prefillPayload) {
    if (alert.prefillPayload.suggestedAmountEur) {
      params.set('amount', alert.prefillPayload.suggestedAmountEur.toString());
    }
    if (alert.prefillPayload.suggestedQuantity) {
      params.set('quantity', alert.prefillPayload.suggestedQuantity.toString());
    }
  }

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

// Get routing config for an alert code
export function getAlertRoutingConfig(code: AlertCode): AlertRoutingConfig | undefined {
  return ALERT_ROUTING_MAP[code];
}

// Enrich alert with routing metadata
export function enrichAlertWithRouting(alert: Alert): Alert {
  const config = ALERT_ROUTING_MAP[alert.code];
  if (!config) return alert;

  return {
    ...alert,
    status: alert.resolved ? 'RESOLVED' : 'OPEN',
    resolutionType: alert.resolutionType || config.resolutionType,
    targetPage: alert.targetPage || config.targetPage,
    targetEntity: alert.targetEntity || (config.getTargetEntity ? config.getTargetEntity(alert) : undefined),
  };
}

// Parse URL search params for deep-linking
export interface DeepLinkParams {
  alertId?: string;
  action?: 'buy' | 'sell' | 'close' | 'edit';
  instrumentId?: string;
  sleeveKey?: string;
  amount?: number;
  quantity?: number;
  panel?: string;
  focus?: string;
  themeSlot?: 'THEME1' | 'THEME2';
}

export function parseDeepLinkParams(searchParams: URLSearchParams): DeepLinkParams {
  return {
    alertId: searchParams.get('alertId') || undefined,
    action: searchParams.get('action') as DeepLinkParams['action'] || undefined,
    instrumentId: searchParams.get('instrumentId') || undefined,
    sleeveKey: searchParams.get('sleeveKey') || undefined,
    amount: searchParams.get('amount') ? parseFloat(searchParams.get('amount')!) : undefined,
    quantity: searchParams.get('quantity') ? parseFloat(searchParams.get('quantity')!) : undefined,
    panel: searchParams.get('panel') || undefined,
    focus: searchParams.get('focus') || undefined,
    themeSlot: searchParams.get('themeSlot') as DeepLinkParams['themeSlot'] || undefined,
  };
}
