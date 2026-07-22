import { D, Decimal, ZERO } from './decimal';
import { replayLedger } from './ledgerReplay';
import { projectPositions, type PositionState } from './positions';
import type { LedgerRow, InstrumentRow } from './types';

/**
 * Motivo per cui uno storno non è ammesso. Il server resta autoritativo:
 * questa simulazione è solo per anteprima UI e per prevenire tentativi
 * palesemente incoerenti (cash/quantità negative).
 */
export type UnreversibleReason =
  | 'is_reversal'
  | 'already_reversed'
  | 'opening_window_closed'
  | 'operation_not_found'
  | 'cash_negative'
  | 'quantity_negative';

export interface CashDiff { before: Decimal; after: Decimal; }
export interface QtyDiff {
  instrumentId: string;
  ticker?: string;
  before: Decimal;
  after: Decimal;
}

export interface ReversibleOk {
  ok: true;
  cash: CashDiff;
  positions: QtyDiff[];
}
export interface ReversibleKo {
  ok: false;
  reason: UnreversibleReason;
  message: string;
  detail?: { instrumentId?: string; ticker?: string; value?: string };
}
export type ReversibleResult = ReversibleOk | ReversibleKo;

/** IDs delle operazioni già stornate (target di una REVERSAL). */
export function reversedIds(rows: LedgerRow[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.op_type === 'REVERSAL' && r.reversal_of_operation_id) {
      s.add(r.reversal_of_operation_id);
    }
  }
  return s;
}

/** Vero se esistono operazioni ordinarie post-migrazione (chiude la finestra amend). */
export function hasOrdinaryOps(rows: LedgerRow[]): boolean {
  return rows.some((r) =>
    r.op_type === 'BUY' ||
    r.op_type === 'SELL' ||
    r.op_type === 'DEPOSIT' ||
    r.op_type === 'WITHDRAW' ||
    r.op_type === 'DIVIDEND' ||
    r.op_type === 'OTHER_INCOME' ||
    r.op_type === 'FEE'
  );
}

function toQtyDiffs(
  before: Map<string, PositionState>,
  after: Map<string, PositionState>,
  instrumentId: string | null,
  instruments: InstrumentRow[] = [],
): QtyDiff[] {
  const ids = new Set<string>();
  if (instrumentId) ids.add(instrumentId);
  for (const id of before.keys()) ids.add(id);
  for (const id of after.keys()) ids.add(id);
  const tickerOf = new Map(instruments.map((i) => [i.id, i.ticker]));
  const diffs: QtyDiff[] = [];
  for (const id of ids) {
    const b = before.get(id)?.quantity ?? ZERO;
    const a = after.get(id)?.quantity ?? ZERO;
    if (!b.eq(a) || id === instrumentId) {
      diffs.push({ instrumentId: id, ticker: tickerOf.get(id), before: b, after: a });
    }
  }
  return diffs;
}

/**
 * Simula lo storno di `targetId`: rieffettua il replay canonico su un ledger
 * che include una REVERSAL virtuale e restituisce il diff cash/posizioni.
 * Rifiuta senza contattare il server nei casi non ammessi.
 */
export function simulateReversal(
  rows: LedgerRow[],
  targetId: string,
  instruments: InstrumentRow[] = [],
): ReversibleResult {
  const target = rows.find((r) => r.id === targetId);
  if (!target) {
    return { ok: false, reason: 'operation_not_found', message: 'Operazione non trovata.' };
  }
  if (target.op_type === 'REVERSAL') {
    return { ok: false, reason: 'is_reversal', message: 'Non è possibile stornare una REVERSAL.' };
  }
  const reversed = reversedIds(rows);
  if (reversed.has(targetId)) {
    return { ok: false, reason: 'already_reversed', message: 'Operazione già stornata.' };
  }
  if (target.op_type === 'OPENING_POSITION' || target.op_type === 'OPENING_CASH') {
    if (hasOrdinaryOps(rows)) {
      return {
        ok: false,
        reason: 'opening_window_closed',
        message: 'Finestra di correzione chiusa: esistono operazioni ordinarie successive.',
      };
    }
  }

  // Stato attuale
  const beforeActive = replayLedger(rows);
  const beforeProj = projectPositions(beforeActive);

  // Ledger simulato: aggiungiamo una REVERSAL "virtuale" con id sintetico.
  const virtualReversal: LedgerRow = {
    id: `__sim__:${targetId}`,
    portfolio_id: target.portfolio_id,
    op_type: 'REVERSAL',
    effective_date: target.effective_date,
    recorded_at: new Date().toISOString(),
    seq: `9${'9'.repeat(18)}`, // grande, ma sortLedger elide comunque le coppie
    instrument_id: null,
    quantity: null,
    gross_amount_eur: null,
    fees_eur: '0',
    opening_cost_eur: null,
    reversal_of_operation_id: targetId,
    currency: null,
    price_ccy: null,
    fx_eur_per_unit: null,
  };
  const simulated = [...rows, virtualReversal];
  const afterActive = replayLedger(simulated);
  const afterProj = projectPositions(afterActive);

  // Cash negativa in qualsiasi punto (approssimazione: check finale).
  // Nota: il server esegue _replay_check punto-a-punto; qui blocchiamo
  // solo i casi grossolani (finale negativo).
  if (afterProj.cash.cashEur.lt(D('-0.005'))) {
    return {
      ok: false,
      reason: 'cash_negative',
      message: `Storno non possibile: la cassa diventerebbe €${afterProj.cash.cashEur.toFixed(2)}.`,
      detail: { value: afterProj.cash.cashEur.toFixed(2) },
    };
  }
  // Qty negativa su qualche strumento
  for (const [id, p] of afterProj.positions) {
    if (p.quantity.lt(D('-0.00005'))) {
      const ticker = instruments.find((i) => i.id === id)?.ticker;
      return {
        ok: false,
        reason: 'quantity_negative',
        message: `Storno non possibile: quantità su ${ticker ?? id} diventerebbe ${p.quantity.toFixed(4)}.`,
        detail: { instrumentId: id, ticker, value: p.quantity.toFixed(4) },
      };
    }
  }

  return {
    ok: true,
    cash: { before: beforeProj.cash.cashEur, after: afterProj.cash.cashEur },
    positions: toQtyDiffs(beforeProj.positions, afterProj.positions, target.instrument_id, instruments),
  };
}

/** Etichetta breve per badge/tag di stato op. */
export function opTypeLabel(t: LedgerRow['op_type']): string {
  switch (t) {
    case 'BUY': return 'Acquisto';
    case 'SELL': return 'Vendita';
    case 'DEPOSIT': return 'Versamento';
    case 'WITHDRAW': return 'Prelievo';
    case 'DIVIDEND': return 'Dividendo';
    case 'OTHER_INCOME': return 'Altro provento';
    case 'FEE': return 'Commissione';
    case 'OPENING_POSITION': return 'Apertura posizione';
    case 'OPENING_CASH': return 'Apertura cassa';
    case 'REVERSAL': return 'Storno';
    default: return t;
  }
}