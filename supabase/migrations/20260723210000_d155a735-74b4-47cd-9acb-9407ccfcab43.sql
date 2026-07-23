-- =========================================================================
-- F6-r2 A3 — Allineamento ordine transazionale delle 4 RPC contabili F1:
--   proprieta' -> LOCK portfolio -> idempotenza -> mutazione.
-- Corpi estratti da pg_get_functiondef dello stato AUTORITATIVO corrente:
-- l'UNICA modifica e' lo spostamento della riga di lock prima di _idem_begin.
-- Conservazione semantica dimostrata con diff del prosrc (solo lock spostato)
-- e smoke F1 completo.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.register_operation(_key text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pid uuid;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_op_type public.op_type;
  v_eff date;
  v_instr uuid;
  v_qty numeric;
  v_price numeric;
  v_ccy public.currency_code;
  v_fx numeric;
  v_gross numeric;
  v_fees numeric;
  v_notes text;
  v_track date;
  v_op_id uuid;
  v_inst_ccy public.currency_code;
  v_inst_status public.instrument_status;
BEGIN
  v_pid := public._owned_portfolio();
  v_hash := md5(_payload::text);

  -- LOCK PRIMA dell'idempotenza (allineamento F6)
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'register_operation', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;


  v_op_type := (_payload->>'op_type')::public.op_type;
  v_eff     := (_payload->>'effective_date')::date;
  v_notes   := _payload->>'notes';
  v_fees    := COALESCE((_payload->>'fees_eur')::numeric, 0);

  IF v_op_type IN ('OPENING_POSITION','OPENING_CASH') THEN
    RAISE EXCEPTION 'use import_opening_balances for OPENING_* operations' USING ERRCODE='22023';
  END IF;

  IF v_op_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'use register_reversal for REVERSAL' USING ERRCODE='22023';
  END IF;

  SELECT tracking_started_on INTO v_track FROM public.portfolios WHERE id = v_pid;
  IF v_track IS NULL THEN
    RAISE EXCEPTION 'portfolio migration not completed: import opening balances first' USING ERRCODE='P0001';
  END IF;
  IF v_eff < v_track THEN
    RAISE EXCEPTION 'effective_date % precedes tracking_started_on %', v_eff, v_track USING ERRCODE='P0001';
  END IF;

  IF v_op_type IN ('BUY','SELL') THEN
    v_instr := (_payload->>'instrument_id')::uuid;
    v_qty   := (_payload->>'quantity')::numeric;
    v_price := (_payload->>'price_ccy')::numeric;
    SELECT currency, status INTO v_inst_ccy, v_inst_status
      FROM public.instruments WHERE id = v_instr AND portfolio_id = v_pid;
    IF v_inst_ccy IS NULL THEN RAISE EXCEPTION 'unknown instrument %', v_instr USING ERRCODE='22023'; END IF;
    IF v_op_type = 'BUY' AND v_inst_status <> 'active' THEN
      RAISE EXCEPTION 'instrument % is not active: BUY not allowed', v_instr USING ERRCODE='42501';
    END IF;
    v_ccy := v_inst_ccy;
    IF v_ccy = 'EUR' THEN
      v_fx := 1;
    ELSE
      v_fx := (_payload->>'fx_eur_per_unit')::numeric;
      IF v_fx IS NULL OR v_fx <= 0 THEN
        RAISE EXCEPTION 'fx_eur_per_unit required for non-EUR trade' USING ERRCODE='22023';
      END IF;
    END IF;
    v_gross := round(v_qty * v_price * v_fx, 2);
  ELSIF v_op_type = 'DIVIDEND' THEN
    v_instr := (_payload->>'instrument_id')::uuid;
    v_gross := (_payload->>'gross_amount_eur')::numeric;
    v_ccy := NULL; v_qty := NULL; v_price := NULL; v_fx := NULL;
  ELSE
    v_gross := (_payload->>'gross_amount_eur')::numeric;
    v_instr := NULL; v_qty := NULL; v_price := NULL; v_ccy := NULL; v_fx := NULL;
  END IF;

  INSERT INTO public.operations(
    portfolio_id, op_type, instrument_id, quantity, price_ccy, currency,
    fx_eur_per_unit, gross_amount_eur, fees_eur, effective_date, notes,
    idempotency_key, payload_hash)
  VALUES (v_pid, v_op_type, v_instr, v_qty, v_price, v_ccy,
    v_fx, v_gross, v_fees, v_eff, v_notes,
    _key, v_hash)
  RETURNING id INTO v_op_id;

  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object('operation_id', v_op_id, 'gross_amount_eur', v_gross);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_operation(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_operation(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_reversal(_key text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pid uuid;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_op_id uuid;
  v_notes text;
  v_orig public.operations%ROWTYPE;
  v_rev_id uuid;
  v_canonical jsonb;
BEGIN
  v_pid := public._owned_portfolio();
  v_op_id := (_payload->>'operation_id')::uuid;
  v_notes := _payload->>'notes';
  v_canonical := jsonb_build_object('operation_id', v_op_id, 'notes', v_notes);
  v_hash := md5(v_canonical::text);

  -- LOCK PRIMA dell'idempotenza (allineamento F6)
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'register_reversal', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;


  SELECT * INTO v_orig FROM public.operations WHERE id = v_op_id AND portfolio_id = v_pid FOR UPDATE;
  IF v_orig.id IS NULL THEN RAISE EXCEPTION 'operation % not found', v_op_id USING ERRCODE='22023'; END IF;
  IF v_orig.op_type = 'REVERSAL' THEN RAISE EXCEPTION 'cannot reverse a REVERSAL' USING ERRCODE='22023'; END IF;

  IF EXISTS (SELECT 1 FROM public.operations WHERE reversal_of_operation_id = v_op_id) THEN
    RAISE EXCEPTION 'operation % already reversed', v_op_id USING ERRCODE='23505';
  END IF;

  INSERT INTO public.operations(
    portfolio_id, op_type, effective_date, gross_amount_eur, fees_eur,
    reversal_of_operation_id, notes, idempotency_key, payload_hash)
  VALUES (v_pid, 'REVERSAL', v_orig.effective_date, NULL, 0,
    v_op_id, v_notes, _key, v_hash)
  RETURNING id INTO v_rev_id;

  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object('reversal_id', v_rev_id, 'original_id', v_op_id, 'effective_date', v_orig.effective_date);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_reversal(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_reversal(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.import_opening_balances(_key text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  -- LOCK PRIMA dell'idempotenza (allineamento F6)
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'import_opening_balances', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
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

REVOKE ALL ON FUNCTION public.import_opening_balances(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_opening_balances(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.amend_opening_import(_key text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  -- LOCK PRIMA dell'idempotenza (allineamento F6)
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'amend_opening_import', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
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

REVOKE ALL ON FUNCTION public.amend_opening_import(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_opening_import(text, jsonb) TO authenticated, service_role;
