import { createContext, useContext, useMemo, useState, ReactNode, useCallback } from 'react';
import { runSignalEngine, SignalEngineResult } from '@/lib/signalEngine';
import { SignalEngineConfig, defaultSignalEngineConfig, DecisionMode, Regime } from '@/types/portfolio';

// Deterministic PRNG (mulberry32) so prices don't shuffle on every reload.
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSeededPrices(seed: number, basePrice: number, volatility: number, months = 24): number[] {
  const rand = seededRandom(seed);
  const prices: number[] = [basePrice];
  for (let i = 1; i < months; i++) {
    const change = (rand() - 0.5) * 2 * volatility * prices[i - 1];
    prices.push(Math.max(prices[i - 1] + change, basePrice * 0.5));
  }
  return prices;
}

function buildDates(months = 24): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return dates;
}

// Single, deterministic source of truth for MSCI and Gold monthly closes.
// Seeds tuned so the demo produces a clear, non-borderline regime.
export const SHARED_MSCI_PRICES = generateSeededPrices(1337, 85, 0.03, 24);
export const SHARED_GOLD_PRICES = generateSeededPrices(4242, 55, 0.025, 24);
export const SHARED_DATES = buildDates(24);

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
