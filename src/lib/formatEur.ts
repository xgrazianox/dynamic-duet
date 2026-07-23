import type { Decimal } from '@/domain/decimal';
/** F6-r2.1 — UNICO formatter monetario (sola presentazione, nessuna matematica).
 * positivo €210,00 · negativo −€210,00 (segno PRIMA del simbolo) · mancante n/d */
export function formatEur(v: Decimal | null | undefined): string {
  if (v === null || v === undefined) return 'n/d';
  const n = Number(v.toFixed(2));
  const abs = Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}€${abs}`;
}
