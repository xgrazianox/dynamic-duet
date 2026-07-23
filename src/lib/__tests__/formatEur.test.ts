import { describe, it, expect } from 'vitest';
import { Decimal } from '@/domain/decimal';
import { formatEur } from '@/lib/formatEur';

describe('formatEur (F6-r2.1)', () => {
  it('positivo €210,00', () => expect(formatEur(new Decimal('210'))).toBe('€210,00'));
  it('negativo −€210,00', () => expect(formatEur(new Decimal('-210'))).toBe('−€210,00'));
  it('mancante n/d', () => { expect(formatEur(null)).toBe('n/d'); expect(formatEur(undefined)).toBe('n/d'); });
  it('migliaia it-IT (separatore secondo ICU ambiente)', () => {
    const expected = `−€${(1234.5).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(formatEur(new Decimal('-1234.5'))).toBe(expected);
  });
});
