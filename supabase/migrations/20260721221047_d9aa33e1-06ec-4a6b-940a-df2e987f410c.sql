
CREATE OR REPLACE FUNCTION public.bootstrap_user_data(_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'bootstrap_user_data: _user_id is required';
  END IF;

  SELECT id INTO v_portfolio_id FROM public.portfolios WHERE user_id = _user_id;
  IF v_portfolio_id IS NOT NULL THEN
    RETURN v_portfolio_id;
  END IF;

  INSERT INTO public.portfolios (user_id, name, base_currency)
  VALUES (_user_id, 'Portafoglio', 'EUR')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_portfolio_id;

  IF v_portfolio_id IS NULL THEN
    SELECT id INTO v_portfolio_id FROM public.portfolios WHERE user_id = _user_id;
    RETURN v_portfolio_id;
  END IF;

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
  )
  ON CONFLICT (portfolio_id) DO NOTHING;

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

  UPDATE public.portfolio_settings
    SET msci_instrument_id = v_id_worldcore,
        gold_instrument_id = v_id_gold
  WHERE portfolio_id = v_portfolio_id;

  INSERT INTO public.target_sets (portfolio_id, regime, version, status)
  VALUES (v_portfolio_id,'RISK_ON',1,'draft') RETURNING id INTO v_ts_on;
  INSERT INTO public.target_sets (portfolio_id, regime, version, status)
  VALUES (v_portfolio_id,'RISK_OFF',1,'draft') RETURNING id INTO v_ts_off;

  -- Risk-On: 10 strumenti (no XEON) + 1 riga Cash = 11 righe, somma 100
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
    (v_ts_on, NULL,           15);

  -- Risk-Off: Quality, Value, Utilities, Gold + 1 riga Cash = 5 righe, somma 100
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_ts_off, v_id_quality,   25),
    (v_ts_off, v_id_value,     15),
    (v_ts_off, v_id_utilities, 15),
    (v_ts_off, v_id_gold,      25),
    (v_ts_off, NULL,           20);

  RETURN v_portfolio_id;
END;
$function$;
