// Single, deterministic source of truth for MSCI, Gold and other monthly closes.
// Both SignalEngineContext and mockData import from here so the numbers shown in
// "Dati & Prezzi", RegimeCard, alerts and the Signal Engine always coincide.

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

export function generateSeededPrices(
  seed: number,
  basePrice: number,
  volatility: number,
  months = 24
): number[] {
  const rand = seededRandom(seed);
  const prices: number[] = [basePrice];
  for (let i = 1; i < months; i++) {
    const change = (rand() - 0.5) * 2 * volatility * prices[i - 1];
    prices.push(Math.max(prices[i - 1] + change, basePrice * 0.5));
  }
  return prices;
}

export function buildDates(months = 24): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return dates;
}

export const SHARED_DATES = buildDates(24);
export const SHARED_MSCI_PRICES = generateSeededPrices(1337, 85, 0.03, 24);
export const SHARED_GOLD_PRICES = generateSeededPrices(4242, 55, 0.025, 24);

// Derived snapshot (last-month ratio + 10m SMA) — used by mockData for the
// StrategyState snapshot and for REGIME_SWITCH alert text so the numbers match
// exactly what the Signal Engine sees.
const RATIOS = SHARED_MSCI_PRICES.map((m, i) => m / SHARED_GOLD_PRICES[i]);
export const SHARED_CURRENT_RATIO = RATIOS[RATIOS.length - 1];
export const SHARED_SMA10 =
  RATIOS.slice(-10).reduce((a, b) => a + b, 0) / 10;