import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computePortfolioState, type PortfolioState } from '@/domain';
import type { DomainInputs, LedgerRow, PriceRow, FxRow, InstrumentRow } from '@/domain/types';

const QK = ['portfolio-state'] as const;

async function fetchInputs(userId: string): Promise<DomainInputs> {
  const { data: pf, error: pfErr } = await supabase
    .from('portfolios').select('id').eq('user_id', userId).maybeSingle();
  if (pfErr) throw pfErr;
  if (!pf) return { operations: [], instruments: [], prices: [], fxRates: [] };

  const [opsRes, insRes, prRes, fxRes] = await Promise.all([
    supabase.from('operations').select('*').eq('portfolio_id', pf.id),
    supabase.from('instruments').select('id,ticker,name,currency,quantity_step').eq('portfolio_id', pf.id),
    supabase.from('price_points').select('instrument_id,price_date,close_price'),
    supabase.from('fx_rates').select('currency,rate_date,eur_per_unit').eq('portfolio_id', pf.id),
  ]);
  if (opsRes.error) throw opsRes.error;
  if (insRes.error) throw insRes.error;
  if (prRes.error) throw prRes.error;
  if (fxRes.error) throw fxRes.error;

  return {
    operations: (opsRes.data ?? []) as unknown as LedgerRow[],
    instruments: (insRes.data ?? []) as unknown as InstrumentRow[],
    prices: (prRes.data ?? []) as unknown as PriceRow[],
    fxRates: (fxRes.data ?? []) as unknown as FxRow[],
  };
}

/**
 * UNICO hook per lo stato di portafoglio derivato dal ledger.
 * I componenti consumano `state`; nessuna matematica nei componenti.
 */
export function usePortfolioState(userId: string | null, asOf?: string) {
  const query = useQuery({
    queryKey: [...QK, userId, asOf ?? null],
    enabled: !!userId,
    queryFn: () => fetchInputs(userId!),
    staleTime: 30_000,
  });

  const state: PortfolioState | null = useMemo(() => {
    if (!query.data) return null;
    return computePortfolioState({ ...query.data, asOf });
  }, [query.data, asOf]);

  return { ...query, state };
}

/** Da invocare dopo ogni RPC di mutazione contabile. */
export function useInvalidatePortfolioState() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QK });
}