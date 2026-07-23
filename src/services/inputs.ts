import { supabase } from '@/integrations/supabase/client';

/** Scritture owner-side per Strumenti / Prezzi / Cambi (F3-A).
 * Le protezioni server-side (trigger F3-0) rifiutano prezzi 'opening'/batch e
 * le modifiche ai campi identità: qui il client tocca solo dati manuali. */

export type CurrencyCode = 'EUR' | 'USD' | 'CHF';
export type InstrumentType = 'ETF' | 'ETC' | 'STOCK' | 'FUND' | 'MONETARY';
export type RegimeClass = 'DEFENSIVE' | 'AGGRESSIVE' | 'BOTH';
export type Sleeve = 'CORE' | 'FACTOR' | 'THEME' | 'HEDGE' | 'MONETARY';

export interface NewInstrument {
  name: string;
  ticker: string;
  currency: CurrencyCode;
  instrument_type: InstrumentType;
  regime_class: RegimeClass;
  sleeve: Sleeve;
  isin?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export async function createInstrument(portfolioId: string, i: NewInstrument): Promise<void> {
  const { error } = await sb.from('instruments').insert({
    portfolio_id: portfolioId,
    name: i.name,
    ticker: i.ticker,
    isin: i.isin ?? null,
    currency: i.currency,
    instrument_type: i.instrument_type,
    regime_class: i.regime_class,
    sleeve: i.sleeve,
  });
  if (error) throw error;
}

/** Cancellazione fisica vietata (trigger F3-0): si archivia. */
export async function archiveInstrument(id: string): Promise<void> {
  const { error } = await sb.from('instruments').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

export async function reactivateInstrument(id: string): Promise<void> {
  const { error } = await sb.from('instruments').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
}

export interface PriceInput { price_date: string; close_price: string; } // valuta NATIVA, stringa

/** Upsert prezzo manuale/CSV (valuta nativa). Il server rifiuta l'upsert su una
 * riga 'opening' esistente (immutabile per il client). */
export async function upsertPrices(
  instrumentId: string, rows: PriceInput[], source: 'manual' | 'csv',
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map(r => ({
    instrument_id: instrumentId,
    price_date: r.price_date,
    close_price: r.close_price,
    source,
  }));
  const { error } = await sb.from('price_points')
    .upsert(payload, { onConflict: 'instrument_id,price_date' });
  if (error) throw error;
}

/** Conferma singola del cambio per una valuta (nessun default automatico). */
export async function confirmFx(
  portfolioId: string, currency: 'USD' | 'CHF', rate_date: string, eur_per_unit: string,
): Promise<void> {
  const { error } = await sb.from('fx_rates')
    .upsert(
      { portfolio_id: portfolioId, currency, rate_date, eur_per_unit },
      { onConflict: 'portfolio_id,currency,rate_date' },
    );
  if (error) throw error;
}

/** Parser CSV "data;prezzo" (una riga per periodo). Ritorna righe valide + errori. */
export function parsePriceCsv(text: string): { rows: PriceInput[]; errors: string[] } {
  const rows: PriceInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const parts = line.split(/[;,\t]/).map(p => p.trim());
    if (parts.length < 2) { errors.push(`Riga ${idx + 1}: formato non valido`); return; }
    const [dateRaw, priceRaw] = parts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) { errors.push(`Riga ${idx + 1}: data "${dateRaw}" non è YYYY-MM-DD`); return; }
    const price = Number(priceRaw.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) { errors.push(`Riga ${idx + 1}: prezzo "${priceRaw}" non valido`); return; }
    rows.push({ price_date: dateRaw, close_price: priceRaw.replace(',', '.') });
  });
  return { rows, errors };
}
