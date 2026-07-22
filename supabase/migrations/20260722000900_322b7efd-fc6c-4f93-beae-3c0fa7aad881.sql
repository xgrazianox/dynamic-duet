
DO $$
DECLARE
  fixture_ids uuid[] := ARRAY[
    '96fa3990-3c1c-4341-bbe5-20c661675a46'::uuid,
    '5e309c44-e332-4d0e-8ab2-04fd94046196'::uuid,
    'bf7bf00d-6d80-4267-ae57-7ee0fd309bbd'::uuid,
    '4aff66fc-f40b-4683-8dd3-c8be72ee801b'::uuid
  ];
BEGIN
  DELETE FROM public.target_allocations
   WHERE target_set_id IN (SELECT id FROM public.target_sets WHERE portfolio_id = ANY(fixture_ids));
  DELETE FROM public.target_sets WHERE portfolio_id = ANY(fixture_ids);
  ALTER TABLE public.operations DISABLE TRIGGER operations_no_delete;
  DELETE FROM public.portfolios WHERE id = ANY(fixture_ids);
  ALTER TABLE public.operations ENABLE TRIGGER operations_no_delete;
END $$;

UPDATE public.instruments i
   SET currency = 'EUR'
 WHERE i.ticker IN ('CLEAN','NASDAQ')
   AND i.currency = 'USD'
   AND NOT EXISTS (SELECT 1 FROM public.operations o WHERE o.instrument_id = i.id);

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
    (v_pid,'Clean Energy','CLEAN','EUR','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_cl;
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

CREATE OR REPLACE FUNCTION public.import_opening_balances(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_pid uuid; v_hash text; v_mreq_id uuid; v_cached jsonb; v_batch uuid;
  v_open_date date; v_cash numeric; v_migrated boolean;
  v_pos jsonb; v_fx jsonb; v_idx int;
  v_inst uuid; v_qty numeric; v_avg_cost numeric; v_price numeric;
  v_open_fx numeric; v_inst_ccy public.currency_code; v_op_id uuid; v_ins_count int := 0;
  v_gross_eur numeric;
BEGIN
  v_pid := public._owned_portfolio();
  v_hash := md5(_payload::text);
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'import_opening_balances', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT migration_completed INTO v_migrated FROM public.portfolio_settings WHERE portfolio_id = v_pid;
  IF v_migrated THEN
    RAISE EXCEPTION 'migration already completed; use amend_opening_import to correct' USING ERRCODE='P0001';
  END IF;
  v_open_date := COALESCE((_payload->>'opening_date')::date, date_trunc('month', CURRENT_DATE)::date);
  v_cash      := COALESCE((_payload->>'opening_cash')::numeric, 0);
  v_batch     := gen_random_uuid();

  IF _payload ? 'fxs' THEN
    FOR v_fx IN SELECT * FROM jsonb_array_elements(_payload->'fxs') LOOP
      INSERT INTO public.fx_rates(portfolio_id, currency, rate_date, eur_per_unit, source_batch_id)
      VALUES (v_pid, (v_fx->>'currency')::public.currency_code, v_open_date,
              (v_fx->>'eur_per_unit')::numeric, v_batch)
      ON CONFLICT (portfolio_id, currency, rate_date) DO UPDATE
        SET eur_per_unit = EXCLUDED.eur_per_unit, source_batch_id = EXCLUDED.source_batch_id;
    END LOOP;
  END IF;

  v_idx := 0;
  IF _payload ? 'positions' THEN
    FOR v_pos IN SELECT * FROM jsonb_array_elements(_payload->'positions') LOOP
      v_idx := v_idx + 1;
      v_inst     := (v_pos->>'instrument_id')::uuid;
      v_qty      := (v_pos->>'quantity')::numeric;
      v_avg_cost := (v_pos->>'average_cost_eur')::numeric;
      v_price    := (v_pos->>'opening_price_ccy')::numeric;
      v_open_fx  := NULLIF(v_pos->>'opening_fx','')::numeric;
      SELECT currency INTO v_inst_ccy FROM public.instruments WHERE id = v_inst AND portfolio_id = v_pid;
      IF v_inst_ccy IS NULL THEN
        RAISE EXCEPTION 'unknown instrument % at index %', v_inst, v_idx USING ERRCODE='22023';
      END IF;
      IF v_inst_ccy = 'EUR' THEN v_open_fx := 1;
      ELSIF v_open_fx IS NULL OR v_open_fx <= 0 THEN
        RAISE EXCEPTION 'opening_fx required for non-EUR instrument at index %', v_idx USING ERRCODE='22023';
      END IF;

      v_gross_eur := round(v_qty * v_price * v_open_fx, 2);

      INSERT INTO public.operations(
        portfolio_id, op_type, instrument_id, quantity, price_ccy, currency,
        fx_eur_per_unit, gross_amount_eur, fees_eur, opening_cost_eur,
        effective_date, source_batch_id, idempotency_key, payload_hash)
      VALUES (v_pid, 'OPENING_POSITION', v_inst, v_qty, v_price, v_inst_ccy,
        v_open_fx, v_gross_eur, 0, round(v_qty * v_avg_cost, 2),
        v_open_date, v_batch, _key || ':pos:' || v_idx, md5(v_pos::text))
      RETURNING id INTO v_op_id;

      INSERT INTO public.price_points(instrument_id, price_date, close_price, source, source_batch_id)
      VALUES (v_inst, v_open_date, v_price, 'opening', v_batch)
      ON CONFLICT (instrument_id, price_date) DO UPDATE
        SET close_price = EXCLUDED.close_price, source = EXCLUDED.source, source_batch_id = EXCLUDED.source_batch_id;
      v_ins_count := v_ins_count + 1;
    END LOOP;
  END IF;

  IF v_cash > 0 THEN
    INSERT INTO public.operations(
      portfolio_id, op_type, gross_amount_eur, fees_eur, effective_date,
      source_batch_id, idempotency_key, payload_hash)
    VALUES (v_pid, 'OPENING_CASH', v_cash, 0, v_open_date, v_batch,
            _key || ':cash', md5(to_jsonb(v_cash)::text));
    v_ins_count := v_ins_count + 1;
  END IF;

  UPDATE public.portfolios SET tracking_started_on = v_open_date WHERE id = v_pid;
  UPDATE public.portfolio_settings SET migration_completed = true WHERE portfolio_id = v_pid;

  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object('batch_id', v_batch, 'opening_date', v_open_date, 'rows_created', v_ins_count);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.amend_opening_import(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_pid uuid; v_hash text; v_mreq_id uuid; v_cached jsonb;
  v_orig_batch uuid; v_new_batch uuid; v_open_date date; v_cash numeric;
  v_migrated boolean; v_bad_ops int; v_op public.operations%ROWTYPE;
  v_pos jsonb; v_fx jsonb; v_idx int := 0;
  v_inst uuid; v_qty numeric; v_avg_cost numeric; v_price numeric;
  v_open_fx numeric; v_inst_ccy public.currency_code;
  v_reversed_count int := 0; v_ins_count int := 0;
  v_gross_eur numeric;
BEGIN
  v_pid := public._owned_portfolio();
  v_hash := md5(_payload::text);
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'amend_opening_import', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT migration_completed INTO v_migrated FROM public.portfolio_settings WHERE portfolio_id = v_pid;
  IF NOT v_migrated THEN RAISE EXCEPTION 'no import to amend' USING ERRCODE='P0001'; END IF;

  v_orig_batch := (_payload->>'original_batch_id')::uuid;
  v_open_date  := COALESCE((_payload->>'opening_date')::date, date_trunc('month', CURRENT_DATE)::date);
  v_cash       := COALESCE((_payload->>'opening_cash')::numeric, 0);
  v_new_batch  := gen_random_uuid();

  SELECT count(*) INTO v_bad_ops FROM public.operations
   WHERE portfolio_id = v_pid
     AND op_type IN ('BUY','SELL','DEPOSIT','WITHDRAW','DIVIDEND','OTHER_INCOME','FEE');
  IF v_bad_ops > 0 THEN
    RAISE EXCEPTION 'amend window closed: % ordinary operation(s) exist', v_bad_ops USING ERRCODE='P0001';
  END IF;

  FOR v_op IN
    SELECT * FROM public.operations
    WHERE portfolio_id = v_pid AND source_batch_id = v_orig_batch
      AND op_type IN ('OPENING_POSITION','OPENING_CASH')
      AND id NOT IN (SELECT reversal_of_operation_id FROM public.operations
                     WHERE portfolio_id=v_pid AND op_type='REVERSAL' AND reversal_of_operation_id IS NOT NULL)
  LOOP
    INSERT INTO public.operations(
      portfolio_id, op_type, effective_date, fees_eur,
      reversal_of_operation_id, source_batch_id, idempotency_key, payload_hash)
    VALUES (v_pid, 'REVERSAL', v_op.effective_date, 0,
      v_op.id, v_new_batch, _key || ':rev:' || v_op.id, md5(v_op.id::text));
    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  DELETE FROM public.price_points WHERE source_batch_id = v_orig_batch;
  DELETE FROM public.fx_rates     WHERE source_batch_id = v_orig_batch;

  IF _payload ? 'fxs' THEN
    FOR v_fx IN SELECT * FROM jsonb_array_elements(_payload->'fxs') LOOP
      INSERT INTO public.fx_rates(portfolio_id, currency, rate_date, eur_per_unit, source_batch_id)
      VALUES (v_pid, (v_fx->>'currency')::public.currency_code, v_open_date,
              (v_fx->>'eur_per_unit')::numeric, v_new_batch)
      ON CONFLICT (portfolio_id, currency, rate_date) DO UPDATE
        SET eur_per_unit = EXCLUDED.eur_per_unit, source_batch_id = EXCLUDED.source_batch_id;
    END LOOP;
  END IF;

  IF _payload ? 'positions' THEN
    FOR v_pos IN SELECT * FROM jsonb_array_elements(_payload->'positions') LOOP
      v_idx := v_idx + 1;
      v_inst := (v_pos->>'instrument_id')::uuid;
      v_qty := (v_pos->>'quantity')::numeric;
      v_avg_cost := (v_pos->>'average_cost_eur')::numeric;
      v_price := (v_pos->>'opening_price_ccy')::numeric;
      v_open_fx := NULLIF(v_pos->>'opening_fx','')::numeric;
      SELECT currency INTO v_inst_ccy FROM public.instruments WHERE id = v_inst AND portfolio_id = v_pid;
      IF v_inst_ccy IS NULL THEN RAISE EXCEPTION 'unknown instrument %', v_inst USING ERRCODE='22023'; END IF;
      IF v_inst_ccy = 'EUR' THEN v_open_fx := 1;
      ELSIF v_open_fx IS NULL OR v_open_fx <= 0 THEN
        RAISE EXCEPTION 'opening_fx required for non-EUR instrument at index %', v_idx USING ERRCODE='22023';
      END IF;

      v_gross_eur := round(v_qty * v_price * v_open_fx, 2);

      INSERT INTO public.operations(
        portfolio_id, op_type, instrument_id, quantity, price_ccy, currency,
        fx_eur_per_unit, gross_amount_eur, fees_eur, opening_cost_eur,
        effective_date, source_batch_id, idempotency_key, payload_hash)
      VALUES (v_pid, 'OPENING_POSITION', v_inst, v_qty, v_price, v_inst_ccy,
        v_open_fx, v_gross_eur, 0, round(v_qty * v_avg_cost, 2),
        v_open_date, v_new_batch, _key || ':pos:' || v_idx, md5(v_pos::text));

      INSERT INTO public.price_points(instrument_id, price_date, close_price, source, source_batch_id)
      VALUES (v_inst, v_open_date, v_price, 'opening', v_new_batch)
      ON CONFLICT (instrument_id, price_date) DO UPDATE
        SET close_price = EXCLUDED.close_price, source = EXCLUDED.source, source_batch_id = EXCLUDED.source_batch_id;
      v_ins_count := v_ins_count + 1;
    END LOOP;
  END IF;

  IF v_cash > 0 THEN
    INSERT INTO public.operations(
      portfolio_id, op_type, gross_amount_eur, fees_eur, effective_date,
      source_batch_id, idempotency_key, payload_hash)
    VALUES (v_pid, 'OPENING_CASH', v_cash, 0, v_open_date, v_new_batch,
            _key || ':cash', md5(to_jsonb(v_cash)::text));
    v_ins_count := v_ins_count + 1;
  END IF;

  UPDATE public.portfolios SET tracking_started_on = v_open_date WHERE id = v_pid;

  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object(
    'new_batch_id', v_new_batch, 'opening_date', v_open_date,
    'reversed_from_original', v_reversed_count, 'rows_created', v_ins_count);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$function$;

REVOKE ALL ON public.operations_v         FROM PUBLIC;
REVOKE ALL ON public.price_points_v       FROM PUBLIC;
REVOKE ALL ON public.fx_rates_v           FROM PUBLIC;
REVOKE ALL ON public.instruments_v        FROM PUBLIC;
REVOKE ALL ON public.target_allocations_v FROM PUBLIC;

GRANT SELECT ON public.operations_v         TO authenticated, service_role;
GRANT SELECT ON public.price_points_v       TO authenticated, service_role;
GRANT SELECT ON public.fx_rates_v           TO authenticated, service_role;
GRANT SELECT ON public.instruments_v        TO authenticated, service_role;
GRANT SELECT ON public.target_allocations_v TO authenticated, service_role;
