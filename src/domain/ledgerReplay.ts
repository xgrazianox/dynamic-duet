import type { LedgerRow } from './types';

/**
 * Ordinamento canonico del ledger:
 * (effective_date ASC, recorded_at ASC, seq ASC).
 * Deterministico: le RPC server impongono `seq` come tiebreaker atomico.
 */
export function sortLedger(rows: LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    if (a.effective_date !== b.effective_date)
      return a.effective_date < b.effective_date ? -1 : 1;
    if (a.recorded_at !== b.recorded_at)
      return a.recorded_at < b.recorded_at ? -1 : 1;
    return a.seq - b.seq;
  });
}

/**
 * Neutralizza le REVERSAL: rimuove sia l'operazione originale sia il suo storno.
 * Somma originale + storno = 0 esatto (lo storno non ha effetti contabili propri:
 * il suo unico ruolo è "cancellare" l'originale dalla proiezione).
 */
export function netReversals(rows: LedgerRow[]): LedgerRow[] {
  const reversedIds = new Set<string>();
  const reversalRowIds = new Set<string>();
  for (const r of rows) {
    if (r.op_type === 'REVERSAL' && r.reversal_of_operation_id) {
      reversedIds.add(r.reversal_of_operation_id);
      reversalRowIds.add(r.id);
    }
  }
  return rows.filter((r) => !reversedIds.has(r.id) && !reversalRowIds.has(r.id));
}

/** Ordina, poi elide le REVERSAL. Restituisce il ledger "attivo". */
export function replayLedger(rows: LedgerRow[]): LedgerRow[] {
  return netReversals(sortLedger(rows));
}