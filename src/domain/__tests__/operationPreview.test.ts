import { describe, it, expect } from 'vitest';
import { proposeFx, previewOperation } from '../operationPreview';
import { D, ZERO } from '../decimal';
import type { FxRow } from '../types';

const fxs: FxRow[] = [
  { currency: 'USD', rate_date: '2025-01-31', eur_per_unit: '0.9200' },
  { currency: 'USD', rate_date: '2025-03-31', eur_per_unit: '0.9300' },
  { currency: 'USD', rate_date: '2025-06-30', eur_per_unit: '0.9400' },
];

describe('proposeFx', () => {
  it('usa l\'ultimo fx storico con data ≤ effective_date', () => {
    const p = proposeFx(fxs, 'USD', '2025-04-15', { USD: '0.9259' });
    expect(p.source).toBe('historical');
    expect(p.fxAsString).toBe('0.9300');
    expect(p.date).toBe('2025-03-31');
  });

  it('esclude FX futuro rispetto a effective_date', () => {
    const p = proposeFx(fxs, 'USD', '2025-02-01', { USD: '0.9259' });
    expect(p.source).toBe('historical');
    expect(p.fxAsString).toBe('0.9200');
  });

  it('fallback default_fx marcato come proposta', () => {
    const p = proposeFx([], 'USD', '2025-04-15', { USD: '0.9259' });
    expect(p.source).toBe('default_fx');
    expect(p.fxAsString).toBe('0.9259');
    expect(p.date).toBeNull();
  });

  it('EUR non richiede FX', () => {
    const p = proposeFx(fxs, 'EUR', '2025-04-15', { USD: '0.9259' });
    expect(p.source).toBe('historical');
    expect(p.fxAsString).toBe('1');
  });
});

describe('previewOperation', () => {
  it('BUY con commissioni: cash e qty aggiornati', () => {
    const r = previewOperation({
      kind: 'BUY', cashBeforeEur: D('1000'), positionQtyBefore: D('10'),
      positionAvgCostEur: D('50'), quantity: '5', priceCcy: '20', fxEurPerUnit: '1',
      feesEur: '2', quantityStep: D('1'), currency: 'EUR', requiresFx: false, hasFxProposal: true,
    });
    expect(r.estimatedGrossEur.toString()).toBe('100');
    expect(r.cashAfterEur.toString()).toBe('898');
    expect(r.positionQtyAfter.toString()).toBe('15');
  });

  it('SELL: P/L realizzato = (gross − fees) − CM × qty', () => {
    const r = previewOperation({
      kind: 'SELL', cashBeforeEur: D('0'), positionQtyBefore: D('10'),
      positionAvgCostEur: D('50'), quantity: '5', priceCcy: '60', fxEurPerUnit: '1',
      feesEur: '1', quantityStep: D('1'), currency: 'EUR', requiresFx: false, hasFxProposal: true,
    });
    expect(r.realizedPnlEur?.toString()).toBe('49');
    expect(r.positionQtyAfter.toString()).toBe('5');
  });

  it('warning cash insufficiente su WITHDRAW', () => {
    const r = previewOperation({
      kind: 'WITHDRAW', cashBeforeEur: D('100'), positionQtyBefore: ZERO, positionAvgCostEur: ZERO,
      grossAmountEur: '200', quantityStep: ZERO, currency: 'EUR', requiresFx: false, hasFxProposal: true,
    });
    expect(r.warnings.some(w => /cash/i.test(w))).toBe(true);
  });

  it('warning quantità eccedente su SELL', () => {
    const r = previewOperation({
      kind: 'SELL', cashBeforeEur: D('0'), positionQtyBefore: D('3'),
      positionAvgCostEur: D('10'), quantity: '10', priceCcy: '10', fxEurPerUnit: '1',
      quantityStep: D('1'), currency: 'EUR', requiresFx: false, hasFxProposal: true,
    });
    expect(r.warnings.some(w => /eccedente/i.test(w))).toBe(true);
  });

  it('warning quantity_step non allineato', () => {
    const r = previewOperation({
      kind: 'BUY', cashBeforeEur: D('10000'), positionQtyBefore: ZERO,
      positionAvgCostEur: ZERO, quantity: '0.5', priceCcy: '10', fxEurPerUnit: '1',
      quantityStep: D('1'), currency: 'EUR', requiresFx: false, hasFxProposal: true,
    });
    expect(r.warnings.some(w => /quantity_step/i.test(w))).toBe(true);
  });

  it('warning FX richiesto e non disponibile', () => {
    const r = previewOperation({
      kind: 'BUY', cashBeforeEur: D('10000'), positionQtyBefore: ZERO,
      positionAvgCostEur: ZERO, quantity: '10', priceCcy: '10', fxEurPerUnit: '',
      quantityStep: ZERO, currency: 'USD', requiresFx: true, hasFxProposal: false,
    });
    expect(r.warnings.some(w => /FX/i.test(w))).toBe(true);
  });
});