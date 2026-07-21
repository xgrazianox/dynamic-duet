import { createContext, useContext, useState, ReactNode } from 'react';
import {
  mockPositions,
  mockInstruments,
  mockTransactions,
  mockAlerts,
  mockClosedPositions,
  defaultStrategyConfig,
} from '@/lib/mockData';
import {
  Alert,
  Instrument,
  PortfolioPosition,
  Transaction,
  ClosedPosition,
  StrategyConfig,
} from '@/types/portfolio';

export interface AppStateContextValue {
  positions: PortfolioPosition[];
  setPositions: React.Dispatch<React.SetStateAction<PortfolioPosition[]>>;
  instruments: Instrument[];
  setInstruments: React.Dispatch<React.SetStateAction<Instrument[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  alerts: Alert[];
  setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>;
  resolveAlert: (alertId: string) => void;
  closedPositions: ClosedPosition[];
  setClosedPositions: React.Dispatch<React.SetStateAction<ClosedPosition[]>>;
  addClosedPosition: (cp: ClosedPosition) => void;
  strategyConfig: StrategyConfig;
  setStrategyConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [positions, setPositions] = useState<PortfolioPosition[]>(mockPositions);
  const [instruments, setInstruments] = useState<Instrument[]>(mockInstruments);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>(mockClosedPositions);
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

  const addClosedPosition = (cp: ClosedPosition) => {
    setClosedPositions((prev) => [...prev, cp]);
  };

  const value: AppStateContextValue = {
    positions,
    setPositions,
    instruments,
    setInstruments,
    transactions,
    setTransactions,
    alerts,
    setAlerts,
    resolveAlert,
    closedPositions,
    setClosedPositions,
    addClosedPosition,
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