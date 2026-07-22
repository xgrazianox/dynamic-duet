import { describe, it, expect } from 'vitest';
import { simulateReversal } from '../reversalSimulation';
import type { LedgerRow, InstrumentRow } from '../types';

const PID = 'p1';
const INS: InstrumentRow[] = [
  { id: 'i1', ticker: 'ACME', name: 'Acme', currency: 'EUR', quantity_step: '1' },
];

function row(over: Partial<LedgerRow> & Pick<LedgerRow, 'id'|'op_type'|'effective_date'|'seq'>): LedgerRow {
  return {
    portfolio_id: PID,
    recorded_at: `${over.effective_date}T00:00:00Z`,
    instrument_id: null, quantity: null,
    gross_amount_eur: null, fees_eur: '0', opening_cost_eur: null,
    reversal_of_operation_id: null, currency: null,
    price_ccy: null, fx_eur_per_unit: null,
    ...over,
  } as LedgerRow;
}

describe('simulateReversal', () => {
  it('caso valido: storno di un DEPOSIT ripristina la cassa', () => {
    const rows: LedgerRow[] = [
      row({ id: 'd1', op_type: 'DEPOSIT', effective_date: '2025-01-01', seq: '1', gross_amount_eur: '1000' }),
    ];
    const r = simulateReversal(rows, 'd1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cash.before.toString()).toBe('1000');
      expect(r.cash.after.toString()).toBe('0');
    }
  });

  it('caso invalido: storno di un DEPOSIT dopo un BUY porta cash < 0', () => {
    const rows: LedgerRow[] = [
      row({ id: 'd1', op_type: 'DEPOSIT', effective_date: '2025-01-01', seq: '1', gross_amount_eur: '1000' }),
      row({ id: 'b1', op_type: 'BUY', effective_date: '2025-01-02', seq: '2',
        instrument_id: 'i1', quantity: '10', gross_amount_eur: '900', currency: 'EUR', price_ccy: '90', fx_eur_per_unit: '1' }),
    ];
    const r = simulateReversal(rows, 'd1', INS);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('cash_negative');
  });

  it('non stornabile: REVERSAL', () => {
    const rows: LedgerRow[] = [
      row({ id: 'd1', op_type: 'DEPOSIT', effective_date: '2025-01-01', seq: '1', gross_amount_eur: '1000' }),
      row({ id: 'r1', op_type: 'REVERSAL', effective_date: '2025-01-01', seq: '2', reversal_of_operation_id: 'd1' }),
    ];
    const r = simulateReversal(rows, 'r1');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('is_reversal');
  });

  it('non stornabile: già stornata', () => {
    const rows: LedgerRow[] = [
      row({ id: 'd1', op_type: 'DEPOSIT', effective_date: '2025-01-01', seq: '1', gross_amount_eur: '1000' }),
      row({ id: 'r1', op_type: 'REVERSAL', effective_date: '2025-01-01', seq: '2', reversal_of_operation_id: 'd1' }),
    ];
    const r = simulateReversal(rows, 'd1');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('already_reversed');
  });

  it('OPENING fuori finestra: presente BUY ordinario', () => {
    const rows: LedgerRow[] = [
      row({ id: 'oc', op_type: 'OPENING_CASH', effective_date: '2025-01-01', seq: '1', gross_amount_eur: '5000' }),
      row({ id: 'b1', op_type: 'BUY', effective_date: '2025-02-01', seq: '2',
        instrument_id: 'i1', quantity: '5', gross_amount_eur: '500', currency: 'EUR', price_ccy: '100', fx_eur_per_unit: '1' }),
    ];
    const r = simulateReversal(rows, 'oc');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('opening_window_closed');
  });

  it('storno di SELL: quantità torna al valore pre-vendita', () => {
    const rows: LedgerRow[] = [
      row({ id: 'd1', op_type: 'DEPOSIT', effective_date: '2025-01-01', seq: '1', gross_amount_eur: '10000' }),
      row({ id: 'b1', op_type: 'BUY', effective_date: '2025-01-02', seq: '2',
        instrument_id: 'i1', quantity: '10', gross_amount_eur: '1000', currency: 'EUR', price_ccy: '100', fx_eur_per_unit: '1' }),
      row({ id: 's1', op_type: 'SELL', effective_date: '2025-02-01', seq: '3',
        instrument_id: 'i1', quantity: '4', gross_amount_eur: '480', currency: 'EUR', price_ccy: '120', fx_eur_per_unit: '1' }),
    ];
    const r = simulateReversal(rows, 's1', INS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const q = r.positions.find((p) => p.instrumentId === 'i1')!;
      expect(q.before.toString()).toBe('6');
      expect(q.after.toString()).toBe('10');
    }
  });
});