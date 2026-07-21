import { createContext, useContext, useState, ReactNode } from 'react';
import {
  mockPositions,
  mockInstruments,
  mockTransactions,
  mockAlerts,
} from '@/lib/mockData';
import {
  Alert,
  Instrument,
  PortfolioPosition,
  Transaction,
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
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [positions, setPositions] = useState<PortfolioPosition[]>(mockPositions);
  const [instruments, setInstruments] = useState<Instrument[]>(mockInstruments);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);

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
    positions,
    setPositions,
    instruments,
    setInstruments,
    transactions,
    setTransactions,
    alerts,
    setAlerts,
    resolveAlert,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}