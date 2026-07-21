import type { Database } from '@/integrations/supabase/types';

export type OpType = Database['public']['Enums']['op_type'];
export type CurrencyCode = Database['public']['Enums']['currency_code'];

/**
 * Riga ledger, come letta da `public.operations`.
 * Tutti i valori numerici sono stringhe/number del server: le convertiamo in Decimal
 * SOLO nel punto di ingresso di `ledgerReplay`. Nessun altro modulo deve usare `number`
 * per grandezze contabili.
 */
export interface LedgerRow {
  id: string;
  portfolio_id: string;
  op_type: OpType;
  effective_date: string; // YYYY-MM-DD
  recorded_at: string;    // ISO
  seq: number;
  instrument_id: string | null;
  quantity: number | string | null;
  gross_amount_eur: number | string | null;
  fees_eur: number | string;
  opening_cost_eur: number | string | null;
  reversal_of_operation_id: string | null;
  currency: CurrencyCode | null;
  price_ccy: number | string | null;
  fx_eur_per_unit: number | string | null;
}

export interface PriceRow {
  instrument_id: string;
  price_date: string;   // YYYY-MM-DD
  close_price: number | string; // in EUR (normalizzato lato server per opening)
}

export interface FxRow {
  currency: CurrencyCode;
  rate_date: string;
  eur_per_unit: number | string;
}

export interface InstrumentRow {
  id: string;
  ticker: string;
  name: string;
  currency: CurrencyCode;
  quantity_step: number;
}

export interface DomainInputs {
  operations: LedgerRow[];
  instruments: InstrumentRow[];
  prices: PriceRow[];
  fxRates: FxRow[];
  asOf?: string; // YYYY-MM-DD
}