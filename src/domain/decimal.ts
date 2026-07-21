import Decimal from 'decimal.js';

// Master: ROUND_HALF_UP obbligatorio. Precisione interna alta.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Convertitore UNICO server→domain. Accetta solo:
 *  - string decimale (dalle viste text-cast *_v)
 *  - Decimal (già costruito internamente)
 *  - null/undefined/'' → 0
 * RIFIUTA number nativo: PostgREST serializza NUMERIC come JSON number, quindi
 * qualsiasi number arrivato qui è già passato per un binary64 → dato non fidato.
 * Le uniche eccezioni sono i test unitari che vogliono creare fixture veloci:
 * per quelle usare esplicitamente `Dtest()`.
 */
export const D = (v: string | Decimal | null | undefined): Decimal => {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  if (v instanceof Decimal) return v;
  if (typeof v === 'string') return new Decimal(v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  throw new TypeError(`D() rejects non-string values in accounting paths (got ${typeof (v as any)})`);
};

/** Solo per test: consente number/Decimal.Value. Non usare nel dominio. */
export const Dtest = (v: Decimal.Value | null | undefined): Decimal =>
  v === null || v === undefined || v === '' ? new Decimal(0) : new Decimal(v);

/** Arrotondamento monetario EUR a 2 decimali HALF_UP. Usare SOLO al confine di output. */
export const roundMoney = (x: Decimal): Decimal =>
  x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Arrotondamento CM interno a 8 decimali HALF_UP. */
export const roundAvgCost = (x: Decimal): Decimal =>
  x.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);

/** Arrotondamento quantità al quantity_step (step come Decimal). */
export const roundQtyToStep = (x: Decimal, step: Decimal): Decimal => {
  if (step.isZero()) return x;
  return x.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(step);
};

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export { Decimal };