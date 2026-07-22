import { supabase } from '@/integrations/supabase/client';

/**
 * Wrapper tipizzati sopra le RPC autoritative (F1.a).
 * Tutti i NUMERIC in ingresso viaggiano come stringhe: il server è la sola
 * autorità sull'aritmetica. Nessun campo derivato (es. gross_amount_eur)
 * per BUY/SELL è mai inviato dal client.
 */

export interface RpcOk {
  operation_id: string;
  gross_amount_eur: string;
}

export interface ReversalOk {
  reversal_id: string;
  original_id: string;
  effective_date: string;
}

export interface BuySellPayload {
  instrument_id: string;
  quantity: string;            // decimale come stringa
  price_ccy: string;           // decimale come stringa (valuta nativa)
  fx_eur_per_unit?: string;    // OBBLIGATORIO solo per strumenti non-EUR
  fees_eur?: string;
  effective_date: string;      // YYYY-MM-DD
  notes?: string;
}

export interface DividendPayload {
  instrument_id: string;
  gross_amount_eur: string;    // netto accreditato in EUR (server-authoritative)
  effective_date: string;
  notes?: string;
}

export interface CashPayload {
  gross_amount_eur: string;
  effective_date: string;
  notes?: string;
}

async function call(rpc: 'register_operation' | 'register_reversal', key: string, payload: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(rpc, { _key: key, _payload: payload });
  if (error) throw error;
  return data;
}

export async function registerBuy(key: string, p: BuySellPayload): Promise<RpcOk> {
  const payload: Record<string, unknown> = {
    op_type: 'BUY',
    instrument_id: p.instrument_id,
    quantity: p.quantity,
    price_ccy: p.price_ccy,
    fees_eur: p.fees_eur ?? '0',
    effective_date: p.effective_date,
    notes: p.notes ?? null,
  };
  if (p.fx_eur_per_unit !== undefined) payload.fx_eur_per_unit = p.fx_eur_per_unit;
  return call('register_operation', key, payload);
}

export async function registerSell(key: string, p: BuySellPayload): Promise<RpcOk> {
  const payload: Record<string, unknown> = {
    op_type: 'SELL',
    instrument_id: p.instrument_id,
    quantity: p.quantity,
    price_ccy: p.price_ccy,
    fees_eur: p.fees_eur ?? '0',
    effective_date: p.effective_date,
    notes: p.notes ?? null,
  };
  if (p.fx_eur_per_unit !== undefined) payload.fx_eur_per_unit = p.fx_eur_per_unit;
  return call('register_operation', key, payload);
}

export async function registerDividend(key: string, p: DividendPayload): Promise<RpcOk> {
  return call('register_operation', key, {
    op_type: 'DIVIDEND',
    instrument_id: p.instrument_id,
    gross_amount_eur: p.gross_amount_eur,
    effective_date: p.effective_date,
    notes: p.notes ?? null,
  });
}

export async function registerCashOp(
  key: string,
  op_type: 'DEPOSIT' | 'WITHDRAW' | 'FEE' | 'OTHER_INCOME',
  p: CashPayload,
): Promise<RpcOk> {
  return call('register_operation', key, {
    op_type,
    gross_amount_eur: p.gross_amount_eur,
    fees_eur: '0',
    effective_date: p.effective_date,
    notes: p.notes ?? null,
  });
}

export async function registerReversal(key: string, operation_id: string, notes?: string): Promise<ReversalOk> {
  return call('register_reversal', key, { operation_id, notes: notes ?? null });
}

/** Idempotency key stabile per una singola bozza di modale. */
export function newIdempotencyKey(): string {
  // Formato: "op:<ts>:<rand>". Il server richiede unicità (portfolio, rpc, key).
  return `op:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}
