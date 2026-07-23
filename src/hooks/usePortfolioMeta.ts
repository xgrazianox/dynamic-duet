import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export interface PortfolioSettings {
  stale_price_days: number;
  default_fx: Record<string, number>;
  msci_instrument_id: string | null;
  gold_instrument_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine_config: any;
  // F5 — NUMERIC arrivano dal client Supabase come number|string: convertiti a
  // stringa PRIMA di entrare nel dominio (mai number nei calcoli finanziari).
  tolerance_pp: string;
  rounding_eur: string;
  min_trade_eur: string;
  take_profit_pct: string;
  simulated_fee_eur: string;
  last_applied_regime: 'RISK_ON' | 'RISK_OFF' | null;
}
export interface PortfolioMeta {
  portfolioId: string | null;
  trackingStartedOn: string | null;
  settings: PortfolioSettings | null;
}

export function usePortfolioMeta(userId: string | null) {
  return useQuery<PortfolioMeta>({
    queryKey: ['portfolio-meta', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: pf, error } = await sb.from('portfolios').select('id, tracking_started_on').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!pf) return { portfolioId: null, trackingStartedOn: null, settings: null };
      const { data: s } = await sb.from('portfolio_settings')
        .select('stale_price_days, default_fx, msci_instrument_id, gold_instrument_id, engine_config, tolerance_pp, rounding_eur, min_trade_eur, take_profit_pct, simulated_fee_eur, last_applied_regime')
        .eq('portfolio_id', pf.id).maybeSingle();
      const settings: PortfolioSettings | null = s ? {
        ...s,
        tolerance_pp: String(s.tolerance_pp),
        rounding_eur: String(s.rounding_eur),
        min_trade_eur: String(s.min_trade_eur),
        take_profit_pct: String(s.take_profit_pct),
        simulated_fee_eur: String(s.simulated_fee_eur),
      } : null;
      return { portfolioId: pf.id, trackingStartedOn: pf.tracking_started_on ?? null, settings };
    },
  });
}

export interface InstrumentFull {
  id: string;
  portfolio_id: string;
  ticker: string;
  name: string;
  currency: 'EUR' | 'USD' | 'CHF';
  instrument_type: string;
  regime_class: 'DEFENSIVE' | 'AGGRESSIVE' | 'BOTH';
  sleeve: string;
  quantity_step: string;
  status: 'active' | 'archived';
}

export function useInstruments(portfolioId: string | null) {
  return useQuery<InstrumentFull[]>({
    queryKey: ['instruments-full', portfolioId],
    enabled: !!portfolioId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.from('instruments_v')
        .select('id,portfolio_id,ticker,name,currency,instrument_type,regime_class,sleeve,quantity_step,status')
        .eq('portfolio_id', portfolioId);
      if (error) throw error;
      return (data ?? []) as InstrumentFull[];
    },
  });
}

export interface PriceRowV { instrument_id: string; price_date: string; close_price: string; source: string; }

export function usePrices(portfolioId: string | null) {
  return useQuery<PriceRowV[]>({
    queryKey: ['prices-full', portfolioId],
    enabled: !!portfolioId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.from('price_points_v').select('instrument_id,price_date,close_price,source');
      if (error) throw error;
      return (data ?? []) as PriceRowV[];
    },
  });
}

export interface TargetSetRow {
  id: string; regime: 'RISK_ON' | 'RISK_OFF'; version: number;
  status: 'draft' | 'active' | 'superseded'; effective_from: string;
}
export interface TargetAllocRow { target_set_id: string; instrument_id: string | null; weight: string; }

export function useTargets(portfolioId: string | null) {
  return useQuery<{ sets: TargetSetRow[]; allocs: TargetAllocRow[] }>({
    queryKey: ['targets', portfolioId],
    enabled: !!portfolioId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: sets, error: e1 } = await sb.from('target_sets')
        .select('id,regime,version,status,effective_from').eq('portfolio_id', portfolioId)
        .order('version', { ascending: false });
      if (e1) throw e1;
      const ids = (sets ?? []).map((s: TargetSetRow) => s.id);
      let allocs: TargetAllocRow[] = [];
      if (ids.length > 0) {
        const { data: a, error: e2 } = await sb.from('target_allocations_v')
          .select('target_set_id,instrument_id,weight').in('target_set_id', ids);
        if (e2) throw e2;
        allocs = (a ?? []) as TargetAllocRow[];
      }
      return { sets: (sets ?? []) as TargetSetRow[], allocs };
    },
  });
}

export interface RegimeDecisionRow {
  id: string; as_of_month: string; final_regime: 'RISK_ON' | 'RISK_OFF' | null;
  regime_a: 'RISK_ON' | 'RISK_OFF' | null; regime_b: 'RISK_ON' | 'RISK_OFF' | null;
  decision_mode: string; is_switch: boolean; decided_at: string; engine_version: string;
}

export function useLatestDecision(portfolioId: string | null) {
  return useQuery<RegimeDecisionRow | null>({
    queryKey: ['latest-decision', portfolioId],
    enabled: !!portfolioId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await sb.from('regime_decisions')
        .select('id,as_of_month,final_regime,regime_a,regime_b,decision_mode,is_switch,decided_at,engine_version')
        .eq('portfolio_id', portfolioId)
        .order('as_of_month', { ascending: false })
        .order('decided_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data && data.length > 0 ? data[0] : null) as RegimeDecisionRow | null;
    },
  });
}

// ---- F5: decisioni di regime complete (per computeRegimeState) ----
export interface RegimeDecisionFull {
  id: string; as_of_month: string; decided_at: string;
  final_regime: 'RISK_ON' | 'RISK_OFF' | null;
  regime_a: 'RISK_ON' | 'RISK_OFF' | null; regime_b: 'RISK_ON' | 'RISK_OFF' | null;
  decision_mode: string; is_switch: boolean; engine_version: string;
  acknowledged_at: string | null;
}

export function useRegimeDecisions(portfolioId: string | null) {
  return useQuery<RegimeDecisionFull[]>({
    queryKey: ['regime-decisions', portfolioId],
    enabled: !!portfolioId,
    staleTime: 15_000,
    queryFn: async () => {
      // HOTFIX F5: nessun limite arbitrario — una lunga coda di UNDETERMINED
      // non deve mai far scomparire un regime determinato precedente.
      const { data, error } = await sb.from('regime_decisions')
        .select('id,as_of_month,decided_at,final_regime,regime_a,regime_b,decision_mode,is_switch,engine_version,acknowledged_at')
        .eq('portfolio_id', portfolioId)
        .order('as_of_month', { ascending: false })
        .order('decided_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RegimeDecisionFull[];
    },
  });
}
