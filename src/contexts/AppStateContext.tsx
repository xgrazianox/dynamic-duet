import { createContext, useContext, useState, ReactNode } from 'react';
import { mockAlerts, defaultStrategyConfig } from '@/lib/mockData';
import { Alert, StrategyConfig } from '@/types/portfolio';

/**
 * Blocco D (F2): AppStateContext conserva SOLO stato UI non contabile.
 * positions/instruments/transactions/closedPositions sono stati rimossi: la
 * contabilità è derivata esclusivamente dal ledger via usePortfolioState.
 * Restano `alerts` e `strategyConfig` (in attesa di F5/F3).
 */
export interface AppStateContextValue {
  alerts: Alert[];
  setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>;
  resolveAlert: (alertId: string) => void;
  strategyConfig: StrategyConfig;
  setStrategyConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(defaultStrategyConfig);

  const resolveAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, resolved: true, status: 'RESOLVED', resolvedAt: new Date().toISOString() }
          : a
      )
    );
  };

  const value: AppStateContextValue = {
    alerts,
    setAlerts,
    resolveAlert,
    strategyConfig,
    setStrategyConfig,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}