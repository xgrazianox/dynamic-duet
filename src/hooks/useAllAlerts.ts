import { useMemo } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { computeDynamicAlerts } from '@/lib/dynamicAlerts';
import { mockTargetsRiskOn, mockTargetsRiskOff } from '@/lib/mockData';
import { Alert } from '@/types/portfolio';

/**
 * Returns the merged list of alerts: static (from AppState) + dynamic
 * (derived from positions vs targets vs strategyConfig).
 */
export function useAllAlerts(): Alert[] {
  const { alerts, positions, strategyConfig } = useAppState();
  const { finalRegime } = useSignalEngine();

  return useMemo(() => {
    const regime: 'RISK_ON' | 'RISK_OFF' =
      finalRegime === 'UNDETERMINED' ? 'RISK_ON' : finalRegime;
    const targets = regime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;
    const asOf = new Date().toISOString().slice(0, 10);
    const dynamic = computeDynamicAlerts(positions, targets, strategyConfig, asOf);
    return [...alerts, ...dynamic];
  }, [alerts, positions, strategyConfig, finalRegime]);
}