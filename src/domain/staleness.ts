/** Unica definizione di "prezzo stantio" (condivisa F4 performance / F5 alerts).
 *  Confine ESCLUSIVO: esattamente = soglia → NON stantio. */
const DAY_MS = 86_400_000;

export function daysBetweenIso(a: string, b: string): number {
  const p = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((p(b) - p(a)) / DAY_MS);
}

export function isStalePrice(lastPriceDate: string, asOf: string, stalePriceDays: number): boolean {
  return daysBetweenIso(lastPriceDate, asOf) > stalePriceDays;
}
