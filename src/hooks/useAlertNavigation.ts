import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { Alert } from '@/types/portfolio';
import { buildAlertNavigationUrl, getAlertRoutingConfig } from '@/lib/alertRouting';

export function useAlertNavigation() {
  const navigate = useNavigate();

  const navigateToResolve = useCallback((alert: Alert) => {
    const url = buildAlertNavigationUrl(alert);
    navigate(url);
  }, [navigate]);

  const getActionLabel = useCallback((alert: Alert): string => {
    const config = getAlertRoutingConfig(alert.code);
    return config?.actionLabel || 'Vai';
  }, []);

  const getDescription = useCallback((alert: Alert): string => {
    const config = getAlertRoutingConfig(alert.code);
    return config?.description || 'Azione necessaria';
  }, []);

  const getDestinationPreview = useCallback((alert: Alert): string => {
    const config = getAlertRoutingConfig(alert.code);
    if (!config) return '';
    
    const pageNames: Record<string, string> = {
      PORTFOLIO: 'Portafoglio',
      SIGNALS: 'Segnali',
      INPUTS: 'Input',
      SETTINGS: 'Impostazioni',
      ALERTS: 'Alert',
    };

    const pageName = pageNames[config.targetPage] || config.targetPage;
    
    if (config.resolutionType === 'OPEN_TRADE_MODAL_BUY') {
      return `${pageName} → Apri modal Acquisto`;
    } else if (config.resolutionType === 'OPEN_TRADE_MODAL_SELL') {
      return `${pageName} → Apri modal Vendita`;
    } else if (config.resolutionType === 'OPEN_SIGNALS_VIEW') {
      return `${pageName} → Pannello segnali`;
    } else if (config.resolutionType === 'OPEN_PRICE_UPDATE') {
      return `${pageName} → Aggiorna quotazioni`;
    }
    
    return pageName;
  }, []);

  return {
    navigateToResolve,
    getActionLabel,
    getDescription,
    getDestinationPreview,
  };
}
