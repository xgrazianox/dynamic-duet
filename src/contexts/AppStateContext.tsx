import { createContext, useContext, useState, ReactNode } from 'react';
import { defaultStrategyConfig } from '@/lib/mockData';
import { StrategyConfig } from '@/types/portfolio';

/**
 * F5: rimossi alerts/setAlerts/resolveAlert e l'import di mockAlerts — gli
 * alert reali sono proiezioni pure del dominio (src/domain/alerts.ts), senza
 * stato "risolto". Resta TEMPORANEAMENTE strategyConfig finché le pagine che
 * lo usano (SettingsPage) non saranno smantellate nella fase prevista.
 */
export interface AppStateContextValue {
  strategyConfig: StrategyConfig;
  setStrategyConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(defaultStrategyConfig);
  return (
    <AppStateContext.Provider value={{ strategyConfig, setStrategyConfig }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
