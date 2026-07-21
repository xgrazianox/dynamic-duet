import Decimal from 'decimal.js';

// Precisione elevata per il costo medio interno (8 decimali logici);
// gli output in EUR vengono arrotondati a 2 nei formatter.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_EVEN });

export const D = (v: Decimal.Value | null | undefined): Decimal =>
  v === null || v === undefined || v === '' ? new Decimal(0) : new Decimal(v);

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export { Decimal };