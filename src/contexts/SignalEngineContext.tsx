import { createContext, useContext, useMemo, useState, ReactNode, useCallback } from 'react';
import { runSignalEngine, SignalEngineResult } from '@/lib/signalEngine';
import { SignalEngineConfig, defaultSignalEngineConfig, DecisionMode, Regime } from '@/types/portfolio';
import {
  SHARED_MSCI_PRICES,
  SHARED_GOLD_PRICES,
  SHARED_DATES,
} from '@/lib/sharedPrices';

export { SHARED_MSCI_PRICES, SHARED_GOLD_PRICES, SHARED_DATES };

export interface SignalEngineContextValue {
  config: SignalEngineConfig;
  setDecisionMode: (mode: DecisionMode) => void;
  updateConfig: (updater: (prev: SignalEngineConfig) => SignalEngineConfig) => void;
  engineResult: SignalEngineResult;
  finalRegime: Regime;
  msciPrices: number[];
  goldPrices: number[];
  dates: string[];
  ratioHistory: Array<{ date: string; ratio: number; sma10: number | null }>;
}

const SignalEngineContext = createContext<SignalEngineContextValue | null>(null);

export function SignalEngineProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SignalEngineConfig>(defaultSignalEngineConfig);

  const engineResult = useMemo(
    () => runSignalEngine(SHARED_MSCI_PRICES, SHARED_GOLD_PRICES, SHARED_DATES, config),
    [config]
  );

  const ratioHistory = useMemo(
    () =>
      engineResult.signalA.history.map((h) => ({
        date: h.date,
        ratio: h.ratio,
        sma10: h.sma,
      })),
    [engineResult]
  );

  const setDecisionMode = useCallback((mode: DecisionMode) => {
    setConfig((prev) => ({ ...prev, decision: { ...prev.decision, mode } }));
  }, []);

  const updateConfig = useCallback(
    (updater: (prev: SignalEngineConfig) => SignalEngineConfig) => {
      setConfig(updater);
    },
    []
  );

  const value: SignalEngineContextValue = {
    config,
    setDecisionMode,
    updateConfig,
    engineResult,
    finalRegime: engineResult.decision.finalRegime,
    msciPrices: SHARED_MSCI_PRICES,
    goldPrices: SHARED_GOLD_PRICES,
    dates: SHARED_DATES,
    ratioHistory,
  };

  return <SignalEngineContext.Provider value={value}>{children}</SignalEngineContext.Provider>;
}

export function useSignalEngine(): SignalEngineContextValue {
  const ctx = useContext(SignalEngineContext);
  if (!ctx) {
    throw new Error('useSignalEngine must be used within SignalEngineProvider');
  }
  return ctx;
}
