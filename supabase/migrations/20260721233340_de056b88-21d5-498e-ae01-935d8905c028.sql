
-- 1. Fix NASDAQ currency EUR (mandato: EQQQ è in EUR).
--    Update esistenti dove non ci sono operazioni collegate (nessun rischio contabile).
UPDATE public.instruments SET currency = 'EUR'
  WHERE ticker = 'NASDAQ'
    AND id NOT IN (SELECT instrument_id FROM public.operations WHERE instrument_id IS NOT NULL);

-- 2. Aggiorna bootstrap_user_data: NASDAQ EUR.
CREATE OR REPLACE FUNCTION public.bootstrap_user_data(_user_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_pid uuid;
  v_wc uuid; v_ql uuid; v_va uuid; v_nq uuid; v_df uuid; v_ut uuid;
  v_cp uuid; v_ur uuid; v_cl uuid; v_gd uuid; v_xe uuid;
  v_ton uuid; v_toff uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'bootstrap_user_data: _user_id required'; END IF;
  SELECT id INTO v_pid FROM public.portfolios WHERE user_id = _user_id;
  IF v_pid IS NOT NULL THEN RETURN v_pid; END IF;
  INSERT INTO public.portfolios (user_id, name, base_currency)
  VALUES (_user_id, 'Portafoglio', 'EUR')
  ON CONFLICT (user_id) DO NOTHING RETURNING id INTO v_pid;
  IF v_pid IS NULL THEN
    SELECT id INTO v_pid FROM public.portfolios WHERE user_id = _user_id;
    RETURN v_pid;
  END IF;
  INSERT INTO public.portfolio_settings (portfolio_id, engine_config)
  VALUES (v_pid, jsonb_build_object(
    'decision_mode','A_AND_B',
    'signalA', jsonb_build_object('smaMonths',10,'bandPct',0.015,'confirmMonths',2),
    'signalB', jsonb_build_object(
      'b1SmaMonths',10,'b1BandPct',0.01,
      'b2SmaMonths',10,'b2BandPct',0.01,
      'b3VolLookback',6,'b3VolThreshold',0.18,
      'minVotesRequired',2,'confirmMonths',2)))
  ON CONFLICT (portfolio_id) DO NOTHING;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'MSCI World Core','WORLDCORE','EUR','ETF','BOTH','CORE') RETURNING id INTO v_wc;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'World Quality','QUALITY','EUR','ETF','BOTH','FACTOR') RETURNING id INTO v_ql;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'World Value','VALUE','EUR','ETF','BOTH','FACTOR') RETURNING id INTO v_va;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Nasdaq / AI & Semis','NASDAQ','EUR','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_nq;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Difesa & Aerospazio','DEFENSE','EUR','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_df;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Utilities & Grid','UTILITIES','EUR','ETF','BOTH','THEME') RETURNING id INTO v_ut;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Metalli Critici & Rame','COPPER','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_cp;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Uranio & Nucleare','URANIUM','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_ur;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Clean Energy','CLEAN','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_cl;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Oro','GOLD','EUR','ETC','BOTH','HEDGE') RETURNING id INTO v_gd;
  INSERT INTO public.instruments (portfolio_id, name, ticker, currency, instrument_type, regime_class, sleeve) VALUES
    (v_pid,'Xtrackers EUR Overnight Rate','XEON','EUR','MONETARY','BOTH','MONETARY') RETURNING id INTO v_xe;
  UPDATE public.portfolio_settings SET msci_instrument_id = v_wc, gold_instrument_id = v_gd
  WHERE portfolio_id = v_pid;
  INSERT INTO public.target_sets (portfolio_id, regime, version, status)
  VALUES (v_pid,'RISK_ON',1,'draft') RETURNING id INTO v_ton;
  INSERT INTO public.target_sets (portfolio_id, regime, version, status)
  VALUES (v_pid,'RISK_OFF',1,'draft') RETURNING id INTO v_toff;
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_ton, v_wc, 35),  (v_ton, v_ql, 7.5), (v_ton, v_va, 7.5),
    (v_ton, v_nq, 8),   (v_ton, v_df, 5),   (v_ton, v_ut, 5),
    (v_ton, v_cp, 6),   (v_ton, v_ur, 4),   (v_ton, v_cl, 4),
    (v_ton, v_gd, 10),  (v_ton, NULL, 8);
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_toff, v_ql, 12.5), (v_toff, v_va, 12.5), (v_toff, v_ut, 15),
    (v_toff, v_gd, 25),   (v_toff, NULL, 35);
  RETURN v_pid;
END;
$function$;

-- 3. Viste text-cast per il trasporto sicuro dei NUMERIC verso il domain.
--    security_invoker=true → RLS delle tabelle base viene applicata al chiamante.
CREATE OR REPLACE VIEW public.operations_v
  WITH (security_invoker = true) AS
SELECT
  id, portfolio_id, op_type, effective_date, recorded_at,
  seq::text AS seq,
  instrument_id,
  quantity::text AS quantity,
  price_ccy::text AS price_ccy,
  currency,
  fx_eur_per_unit::text AS fx_eur_per_unit,
  gross_amount_eur::text AS gross_amount_eur,
  fees_eur::text AS fees_eur,
  opening_cost_eur::text AS opening_cost_eur,
  reversal_of_operation_id,
  source_batch_id,
  notes
FROM public.operations;
GRANT SELECT ON public.operations_v TO authenticated;
GRANT ALL   ON public.operations_v TO service_role;

CREATE OR REPLACE VIEW public.price_points_v
  WITH (security_invoker = true) AS
SELECT instrument_id, price_date, close_price::text AS close_price, source
FROM public.price_points;
GRANT SELECT ON public.price_points_v TO authenticated;
GRANT ALL   ON public.price_points_v TO service_role;

CREATE OR REPLACE VIEW public.fx_rates_v
  WITH (security_invoker = true) AS
SELECT portfolio_id, currency, rate_date, eur_per_unit::text AS eur_per_unit
FROM public.fx_rates;
GRANT SELECT ON public.fx_rates_v TO authenticated;
GRANT ALL   ON public.fx_rates_v TO service_role;

CREATE OR REPLACE VIEW public.instruments_v
  WITH (security_invoker = true) AS
SELECT id, portfolio_id, ticker, name, currency, instrument_type,
       regime_class, sleeve, quantity_step::text AS quantity_step
FROM public.instruments;
GRANT SELECT ON public.instruments_v TO authenticated;
GRANT ALL   ON public.instruments_v TO service_role;

CREATE OR REPLACE VIEW public.target_allocations_v
  WITH (security_invoker = true) AS
SELECT target_set_id, instrument_id, weight::text AS weight
FROM public.target_allocations;
GRANT SELECT ON public.target_allocations_v TO authenticated;
GRANT ALL   ON public.target_allocations_v TO service_role;
