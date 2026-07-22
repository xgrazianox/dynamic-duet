-- Blocco 0 F2: append status a instruments_v; BUY su non-active rifiutata server-side.

CREATE OR REPLACE VIEW public.instruments_v AS
SELECT
  id,
  portfolio_id,
  ticker,
  name,
  currency,
  instrument_type,
  regime_class,
  sleeve,
  (quantity_step)::text AS quantity_step,
  status::text AS status
FROM public.instruments;

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

  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'register_operation', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;

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