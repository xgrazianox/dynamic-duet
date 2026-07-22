import type { Database } from '@/integrations/supabase/types';

export type OpType = Database['public']['Enums']['op_type'];
export type CurrencyCode = Database['public']['Enums']['currency_code'];

/**
 * Riga ledger dalla vista `operations_v` (NUMERIC serializzati come TESTO).
 * TUTTI i campi numerici sono `string | null`: il domain rifiuta esplicitamente number.
 * `seq` è testo per gestire bigint > Number.MAX_SAFE_INTEGER senza perdita.
 */
export interface LedgerRow {
  id: string;
  portfolio_id: string;
  op_type: OpType;
  effective_date: string; // YYYY-MM-DD
  recorded_at: string;    // ISO
  seq: string;            // bigint-as-text
  instrument_id: string | null;
  quantity: string | null;
  gross_amount_eur: string | null;
  fees_eur: string;
  opening_cost_eur: string | null;
  reversal_of_operation_id: string | null;
  currency: CurrencyCode | null;
  price_ccy: string | null;
  fx_eur_per_unit: string | null;
}

export interface PriceRow {
  instrument_id: string;
  price_date: string;   // YYYY-MM-DD
  close_price: string;  // SEMPRE in valuta nativa dell'instrument
}

export interface FxRow {
  currency: CurrencyCode;
  rate_date: string;
  eur_per_unit: string; // convenzione: EUR per 1 unità di valuta estera
}

export interface InstrumentRow {
  id: string;
  ticker: string;
  name: string;
  currency: CurrencyCode;
  quantity_step: string;
}

export interface DomainInputs {
  operations: LedgerRow[];
  instruments: InstrumentRow[];
  prices: PriceRow[];
  fxRates: FxRow[];
  asOf?: string; // YYYY-MM-DD
}