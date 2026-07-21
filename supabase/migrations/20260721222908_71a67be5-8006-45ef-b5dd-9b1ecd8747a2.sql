
-- === 1) Trigger sostituiti: bypass per ruolo effettivo (owner delle RPC), non per GUC ===
CREATE OR REPLACE FUNCTION public.block_protected_portfolio_updates()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- current_user è il ruolo effettivo: dentro una SECURITY DEFINER di proprietà 'postgres'
  -- diventa 'postgres'; per un client authenticated resta 'authenticated'.
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;
  IF NEW.tracking_started_on IS DISTINCT FROM OLD.tracking_started_on THEN
    RAISE EXCEPTION 'tracking_started_on can only be updated by authoritative RPCs' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_protected_settings_updates()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;
  IF NEW.migration_completed IS DISTINCT FROM OLD.migration_completed
     OR NEW.last_applied_regime IS DISTINCT FROM OLD.last_applied_regime THEN
    RAISE EXCEPTION 'protected settings columns can only be updated by authoritative RPCs' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- === 2) Rimuovere set_config('app.rpc_bypass',...) dalle RPC di import/amend ===
CREATE OR REPLACE FUNCTION public.import_opening_balances(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_pid uuid; v_hash text; v_mreq_id uuid; v_cached jsonb; v_batch uuid;
  v_open_date date; v_cash numeric; v_migrated boolean;
  v_pos jsonb; v_fx jsonb; v_idx int;
  v_inst uuid; v_qty numeric; v_avg_cost numeric; v_price numeric;
  v_open_fx numeric; v_inst_ccy public.currency_code; v_op_id uuid; v_ins_count int := 0;
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
      INSERT INTO public.operations(
        portfolio_id, op_type, instrument_id, quantity, price_ccy, currency,
        fx_eur_per_unit, gross_amount_eur, fees_eur, opening_cost_eur,
        effective_date, source_batch_id, idempotency_key, payload_hash)
      VALUES (v_pid, 'OPENING_POSITION', v_inst, v_qty, v_price, v_inst_ccy,
        v_open_fx, round(v_qty * v_avg_cost, 2), 0, round(v_qty * v_avg_cost, 2),
        v_open_date, v_batch, _key || ':pos:' || v_idx, md5(v_pos::text))
      RETURNING id INTO v_op_id;
      INSERT INTO public.price_points(instrument_id, price_date, close_price, source, source_batch_id)
      VALUES (v_inst, v_open_date,
              CASE WHEN v_inst_ccy='EUR' THEN v_price ELSE round(v_price * v_open_fx, 6) END,
              'opening', v_batch)
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

  -- Aggiornamento campi protetti: consentito perché current_user = postgres (owner della RPC)
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
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_pid uuid; v_hash text; v_mreq_id uuid; v_cached jsonb;
  v_orig_batch uuid; v_new_batch uuid; v_open_date date; v_cash numeric;
  v_migrated boolean; v_bad_ops int; v_op public.operations%ROWTYPE;
  v_pos jsonb; v_fx jsonb; v_idx int := 0;
  v_inst uuid; v_qty numeric; v_avg_cost numeric; v_price numeric;
  v_open_fx numeric; v_inst_ccy public.currency_code;
  v_reversed_count int := 0; v_ins_count int := 0;
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
      INSERT INTO public.operations(
        portfolio_id, op_type, instrument_id, quantity, price_ccy, currency,
        fx_eur_per_unit, gross_amount_eur, fees_eur, opening_cost_eur,
        effective_date, source_batch_id, idempotency_key, payload_hash)
      VALUES (v_pid, 'OPENING_POSITION', v_inst, v_qty, v_price, v_inst_ccy,
        v_open_fx, round(v_qty * v_avg_cost, 2), 0, round(v_qty * v_avg_cost, 2),
        v_open_date, v_new_batch, _key || ':pos:' || v_idx, md5(v_pos::text));
      INSERT INTO public.price_points(instrument_id, price_date, close_price, source, source_batch_id)
      VALUES (v_inst, v_open_date,
              CASE WHEN v_inst_ccy='EUR' THEN v_price ELSE round(v_price * v_open_fx, 6) END,
              'opening', v_new_batch)
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

-- === 3) Privilegi: RPC pubbliche solo ad authenticated + service_role ===
REVOKE ALL ON FUNCTION public.register_operation(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_reversal(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_opening_balances(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.amend_opening_import(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_operation(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_reversal(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_opening_balances(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.amend_opening_import(text, jsonb) TO authenticated, service_role;

-- Helper interni: solo service_role (postgres già owner)
REVOKE ALL ON FUNCTION public._replay_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._idem_begin(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._idem_commit(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._owned_portfolio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._replay_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._idem_begin(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._idem_commit(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._owned_portfolio() TO service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_user_data(uuid) TO service_role;
