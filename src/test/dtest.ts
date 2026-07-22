import Decimal from 'decimal.js';

/**
 * Helper SOLO per test. Accetta number/Decimal.Value per fixture rapide.
 * Vietato in qualsiasi modulo runtime: i moduli sotto `src/domain/**` (o
 * qualsiasi altro codice di produzione) devono usare `D()` da
 * `src/domain/decimal.ts`, che rifiuta i number nativi.
 */
export const Dtest = (v: Decimal.Value | null | undefined): Decimal =>
  v === null || v === undefined || v === '' ? new Decimal(0) : new Decimal(v);