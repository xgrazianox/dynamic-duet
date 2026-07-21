
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.currency_code AS ENUM ('EUR','USD','CHF');
CREATE TYPE public.op_type AS ENUM (
  'DEPOSIT','WITHDRAW','BUY','SELL','DIVIDEND','OTHER_INCOME',
  'FEE','REVERSAL','OPENING_CASH','OPENING_POSITION'
);
CREATE TYPE public.instrument_type AS ENUM ('ETF','ETC','STOCK','FUND','MONETARY');
CREATE TYPE public.regime_class AS ENUM ('DEFENSIVE','AGGRESSIVE','BOTH');
CREATE TYPE public.sleeve AS ENUM ('CORE','FACTOR','THEME','HEDGE','MONETARY');
CREATE TYPE public.instrument_status AS ENUM ('active','archived');
CREATE TYPE public.regime AS ENUM ('RISK_ON','RISK_OFF');
CREATE TYPE public.target_set_status AS ENUM ('draft','active','superseded');
CREATE TYPE public.price_source AS ENUM ('manual','csv','opening');

-- ============================================================
-- portfolios
-- ============================================================
CREATE TABLE public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Portafoglio',
  base_currency public.currency_code NOT NULL DEFAULT 'EUR',
  tracking_started_on date NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY portfolios_sel_own ON public.portfolios FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY portfolios_upd_own ON public.portfolios FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- portfolio_settings
-- ============================================================
CREATE TABLE public.portfolio_settings (
  portfolio_id uuid PRIMARY KEY REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tolerance_pp numeric(6,2) NOT NULL DEFAULT 0.5,
  rounding_eur numeric(10,2) NOT NULL DEFAULT 50,
  min_trade_eur numeric(10,2) NOT NULL DEFAULT 100,
  take_profit_pct numeric(6,2) NOT NULL DEFAULT 30,
  stale_price_days integer NOT NULL DEFAULT 45,
  default_fx jsonb NOT NULL DEFAULT '{"USD":0.9259,"CHF":1.06}'::jsonb,
  simulated_fee_eur numeric(10,2) NOT NULL DEFAULT 0,
  msci_instrument_id uuid NULL,
  gold_instrument_id uuid NULL,
  engine_config jsonb NOT NULL,
  migration_completed boolean NOT NULL DEFAULT false,
  last_applied_regime public.regime NULL,
  tilt_enabled boolean NOT NULL DEFAULT false
);
GRANT SELECT, UPDATE ON public.portfolio_settings TO authenticated;
GRANT ALL ON public.portfolio_settings TO service_role;
ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY psettings_sel_own ON public.portfolio_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = portfolio_settings.portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY psettings_upd_own ON public.portfolio_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = portfolio_settings.portfolio_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = portfolio_settings.portfolio_id AND p.user_id = auth.uid()));

-- ============================================================
-- instruments
-- ============================================================
CREATE TABLE public.instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name text NOT NULL,
  ticker text NOT NULL,
  isin text NULL,
  currency public.currency_code NOT NULL,
  instrument_type public.instrument_type NOT NULL,
  regime_class public.regime_class NOT NULL,
  sleeve public.sleeve NOT NULL,
  quantity_step numeric(18,4) NOT NULL DEFAULT 1 CHECK (quantity_step > 0),
  status public.instrument_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, ticker)
);
GRANT SELECT, INSERT, UPDATE ON public.instruments TO authenticated;
GRANT ALL ON public.instruments TO service_role;
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY instruments_sel_own ON public.instruments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = instruments.portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY instruments_ins_own ON public.instruments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = instruments.portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY instruments_upd_own ON public.instruments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = instruments.portfolio_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = instruments.portfolio_id AND p.user_id = auth.uid()));

-- Now we can add FKs to portfolio_settings referencing instruments
ALTER TABLE public.portfolio_settings
  ADD CONSTRAINT psettings_msci_fk FOREIGN KEY (msci_instrument_id) REFERENCES public.instruments(id) ON DELETE SET NULL,
  ADD CONSTRAINT psettings_gold_fk FOREIGN KEY (gold_instrument_id) REFERENCES public.instruments(id) ON DELETE SET NULL;

-- ============================================================
-- price_points
-- ============================================================
CREATE TABLE public.price_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  price_date date NOT NULL,
  close_price numeric(18,6) NOT NULL CHECK (close_price > 0),
  source public.price_source NOT NULL,
  source_batch_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, price_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_points TO authenticated;
GRANT ALL ON public.price_points TO service_role;
ALTER TABLE public.price_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY prices_sel_own ON public.price_points FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.instruments i JOIN public.portfolios p ON p.id = i.portfolio_id
    WHERE i.id = price_points.instrument_id AND p.user_id = auth.uid()
  ));
CREATE POLICY prices_ins_own ON public.price_points FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.instruments i JOIN public.portfolios p ON p.id = i.portfolio_id
    WHERE i.id = price_points.instrument_id AND p.user_id = auth.uid()
  ));
CREATE POLICY prices_upd_own ON public.price_points FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.instruments i JOIN public.portfolios p ON p.id = i.portfolio_id
    WHERE i.id = price_points.instrument_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.instruments i JOIN public.portfolios p ON p.id = i.portfolio_id
    WHERE i.id = price_points.instrument_id AND p.user_id = auth.uid()
  ));
CREATE POLICY prices_del_own ON public.price_points FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.instruments i JOIN public.portfolios p ON p.id = i.portfolio_id
    WHERE i.id = price_points.instrument_id AND p.user_id = auth.uid()
  ));

-- ============================================================
-- fx_rates
-- ============================================================
CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL CHECK (currency IN ('USD','CHF')),
  rate_date date NOT NULL,
  eur_per_unit numeric(18,8) NOT NULL CHECK (eur_per_unit > 0),
  source_batch_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, currency, rate_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY fx_sel_own ON public.fx_rates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = fx_rates.portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY fx_ins_own ON public.fx_rates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = fx_rates.portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY fx_upd_own ON public.fx_rates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = fx_rates.portfolio_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = fx_rates.portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY fx_del_own ON public.fx_rates FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = fx_rates.portfolio_id AND p.user_id = auth.uid()));

-- ============================================================
-- operations (ledger, append-only, RPC-only)
-- ============================================================
CREATE TABLE public.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  op_type public.op_type NOT NULL,
  instrument_id uuid NULL REFERENCES public.instruments(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NULL,
  price_ccy numeric(18,6) NULL,
  currency public.currency_code NULL,
  fx_eur_per_unit numeric(18,8) NULL,
  gross_amount_eur numeric(14,2) NULL,
  fees_eur numeric(14,2) NOT NULL DEFAULT 0,
  opening_cost_eur numeric(14,2) NULL,
  source_batch_id uuid NULL,
  effective_date date NOT NULL CHECK (effective_date <= current_date),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  reversal_of_operation_id uuid NULL UNIQUE REFERENCES public.operations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  notes text NULL,
  UNIQUE (portfolio_id, idempotency_key),
  CONSTRAINT ck_operations_shape CHECK (
    CASE op_type
      WHEN 'BUY' THEN
        instrument_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0
        AND price_ccy IS NOT NULL AND price_ccy > 0
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'SELL' THEN
        instrument_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0
        AND price_ccy IS NOT NULL AND price_ccy > 0
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'OPENING_POSITION' THEN
        instrument_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0
        AND price_ccy IS NOT NULL AND price_ccy > 0
        AND opening_cost_eur IS NOT NULL AND opening_cost_eur > 0
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'DEPOSIT' THEN
        instrument_id IS NULL AND quantity IS NULL
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'WITHDRAW' THEN
        instrument_id IS NULL AND quantity IS NULL
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'OPENING_CASH' THEN
        instrument_id IS NULL AND quantity IS NULL
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'FEE' THEN
        instrument_id IS NULL AND quantity IS NULL
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'DIVIDEND' THEN
        instrument_id IS NOT NULL AND quantity IS NULL AND price_ccy IS NULL
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'OTHER_INCOME' THEN
        instrument_id IS NULL AND quantity IS NULL
        AND gross_amount_eur IS NOT NULL AND gross_amount_eur > 0
      WHEN 'REVERSAL' THEN
        reversal_of_operation_id IS NOT NULL
      ELSE true
    END
  )
);
GRANT SELECT ON public.operations TO authenticated;
GRANT ALL ON public.operations TO service_role;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY operations_sel_own ON public.operations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = operations.portfolio_id AND p.user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies: mutations go through SECURITY DEFINER RPCs (Fase 1).

-- Append-only trigger: block UPDATE/DELETE from every session (including SQL).
CREATE OR REPLACE FUNCTION public.operations_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'operations table is append-only: UPDATE/DELETE not allowed';
END;
$$;
CREATE TRIGGER operations_no_update
  BEFORE UPDATE ON public.operations
  FOR EACH ROW EXECUTE FUNCTION public.operations_append_only();
CREATE TRIGGER operations_no_delete
  BEFORE DELETE ON public.operations
  FOR EACH ROW EXECUTE FUNCTION public.operations_append_only();

CREATE INDEX ix_operations_portfolio_date ON public.operations (portfolio_id, effective_date, recorded_at, seq);

-- ============================================================
-- mutation_requests (RPC-only, no client access at all)
-- ============================================================
CREATE TABLE public.mutation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  rpc_name text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL,
  result jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, rpc_name, idempotency_key)
);
GRANT ALL ON public.mutation_requests TO service_role;
-- No GRANT to anon or authenticated: never exposed to clients.
ALTER TABLE public.mutation_requests ENABLE ROW LEVEL SECURITY;
-- No policies at all: client cannot SELECT/INSERT/UPDATE/DELETE.

-- ============================================================
-- target_sets
-- ============================================================
CREATE TABLE public.target_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  regime public.regime NOT NULL,
  version integer NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  status public.target_set_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, regime, version)
);
GRANT SELECT ON public.target_sets TO authenticated;
GRANT ALL ON public.target_sets TO service_role;
ALTER TABLE public.target_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tsets_sel_own ON public.target_sets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = target_sets.portfolio_id AND p.user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies (RPC-only).
CREATE UNIQUE INDEX ux_tsets_one_active_per_regime
  ON public.target_sets (portfolio_id, regime)
  WHERE status = 'active';

-- ============================================================
-- target_allocations
-- ============================================================
CREATE TABLE public.target_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_set_id uuid NOT NULL REFERENCES public.target_sets(id) ON DELETE CASCADE,
  instrument_id uuid NULL REFERENCES public.instruments(id) ON DELETE RESTRICT,
  weight numeric(7,4) NOT NULL CHECK (weight >= 0),
  UNIQUE (target_set_id, instrument_id)
);
GRANT SELECT ON public.target_allocations TO authenticated;
GRANT ALL ON public.target_allocations TO service_role;
ALTER TABLE public.target_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY talloc_sel_own ON public.target_allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.target_sets ts JOIN public.portfolios p ON p.id = ts.portfolio_id
    WHERE ts.id = target_allocations.target_set_id AND p.user_id = auth.uid()
  ));
-- No INSERT/UPDATE/DELETE policies (RPC-only).
CREATE UNIQUE INDEX ux_talloc_single_cash_row
  ON public.target_allocations (target_set_id)
  WHERE instrument_id IS NULL;

-- ============================================================
-- regime_decisions
-- ============================================================
CREATE TABLE public.regime_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  as_of_month date NOT NULL,
  regime_a public.regime NULL,
  regime_b public.regime NULL,
  final_regime public.regime NULL,
  decision_mode text NOT NULL,
  config jsonb NOT NULL,
  config_hash text NOT NULL,
  input_fingerprint text NOT NULL,
  engine_version text NOT NULL,
  is_switch boolean NOT NULL DEFAULT false,
  decided_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz NULL,
  acknowledged_by uuid NULL,
  UNIQUE (portfolio_id, as_of_month, config_hash, input_fingerprint)
);
GRANT SELECT ON public.regime_decisions TO authenticated;
GRANT ALL ON public.regime_decisions TO service_role;
ALTER TABLE public.regime_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rdec_sel_own ON public.regime_decisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portfolios p WHERE p.id = regime_decisions.portfolio_id AND p.user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies (Edge Function + service_role RPC only).

-- ============================================================
-- handle_new_user: seed anagrafica + bozze target al primo login
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portfolio_id uuid;
  v_id_worldcore uuid;
  v_id_quality uuid;
  v_id_value uuid;
  v_id_nasdaq uuid;
  v_id_defense uuid;
  v_id_utilities uuid;
  v_id_copper uuid;
  v_id_uranium uuid;
  v_id_clean uuid;
  v_id_gold uuid;
  v_id_xeon uuid;
  v_ts_on uuid;
  v_ts_off uuid;
BEGIN
  INSERT INTO public.portfolios (user_id, name, base_currency)
  VALUES (NEW.id, 'Portafoglio', 'EUR')
  RETURNING id INTO v_portfolio_id;

  INSERT INTO public.portfolio_settings (portfolio_id, engine_config)
  VALUES (
    v_portfolio_id,
    jsonb_build_object(
      'decision_mode','A_AND_B',
      'signalA', jsonb_build_object('smaMonths',10,'bandPct',0.015,'confirmMonths',2),
      'signalB', jsonb_build_object(
        'b1SmaMonths',10,'b1BandPct',0.01,
        'b2SmaMonths',10,'b2BandPct',0.01,
        'b3VolLookback',6,'b3VolThreshold',0.18,
        'minVotesRequired',2,'confirmMonths',2
      )
    )
  );

  -- 11 strumenti anagrafici (nessun prezzo, nessuna operazione)
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'MSCI World Core','WORLDCORE','EUR','ETF','BOTH','CORE') RETURNING id INTO v_id_worldcore;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'World Quality','QUALITY','EUR','ETF','BOTH','FACTOR') RETURNING id INTO v_id_quality;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'World Value','VALUE','EUR','ETF','BOTH','FACTOR') RETURNING id INTO v_id_value;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Nasdaq / AI & Semis','NASDAQ','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_id_nasdaq;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Difesa & Aerospazio','DEFENSE','EUR','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_id_defense;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Utilities & Grid','UTILITIES','EUR','ETF','BOTH','THEME') RETURNING id INTO v_id_utilities;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Metalli Critici & Rame','COPPER','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_id_copper;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Uranio & Nucleare','URANIUM','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_id_uranium;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Clean Energy','CLEAN','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_id_clean;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Oro','GOLD','EUR','ETC','BOTH','HEDGE') RETURNING id INTO v_id_gold;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve)
  VALUES (v_portfolio_id,'Xtrackers EUR Overnight Rate','XEON','EUR','MONETARY','BOTH','MONETARY') RETURNING id INTO v_id_xeon;

  -- Link driver del Signal Engine
  UPDATE public.portfolio_settings
    SET msci_instrument_id = v_id_worldcore,
        gold_instrument_id = v_id_gold
  WHERE portfolio_id = v_portfolio_id;

  -- Bozze target_sets (RISK_ON + RISK_OFF), status='draft', versione 1
  INSERT INTO public.target_sets (portfolio_id, regime, version, status)
  VALUES (v_portfolio_id,'RISK_ON',1,'draft') RETURNING id INTO v_ts_on;
  INSERT INTO public.target_sets (portfolio_id, regime, version, status)
  VALUES (v_portfolio_id,'RISK_OFF',1,'draft') RETURNING id INTO v_ts_off;

  -- Allocazioni RISK_ON (somma = 100)
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_ts_on, v_id_worldcore, 25),
    (v_ts_on, v_id_quality,   10),
    (v_ts_on, v_id_value,      5),
    (v_ts_on, v_id_nasdaq,    15),
    (v_ts_on, v_id_defense,    5),
    (v_ts_on, v_id_utilities,  5),
    (v_ts_on, v_id_copper,     5),
    (v_ts_on, v_id_uranium,    5),
    (v_ts_on, v_id_clean,      5),
    (v_ts_on, v_id_gold,       5),
    (v_ts_on, v_id_xeon,       5),
    (v_ts_on, NULL,           10);

  -- Allocazioni RISK_OFF (somma = 100)
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_ts_off, v_id_worldcore, 15),
    (v_ts_off, v_id_quality,   15),
    (v_ts_off, v_id_value,     10),
    (v_ts_off, v_id_utilities, 10),
    (v_ts_off, v_id_gold,      20),
    (v_ts_off, v_id_xeon,      20),
    (v_ts_off, NULL,           10);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
