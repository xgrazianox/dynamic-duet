
-- =========================================================================
-- 1) FIX SEED WEIGHTS
-- =========================================================================
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
    (v_pid,'Nasdaq / AI & Semis','NASDAQ','USD','ETF','AGGRESSIVE','THEME') RETURNING id INTO v_nq;
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

  -- Risk-On (Σ=100): WORLDCORE 35 · QUALITY 7.5 · VALUE 7.5 · NASDAQ 8 · DEFENSE 5 ·
  -- UTILITIES 5 · COPPER 6 · URANIUM 4 · CLEAN 4 · GOLD 10 · Cash 8
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_ton, v_wc, 35),  (v_ton, v_ql, 7.5), (v_ton, v_va, 7.5),
    (v_ton, v_nq, 8),   (v_ton, v_df, 5),   (v_ton, v_ut, 5),
    (v_ton, v_cp, 6),   (v_ton, v_ur, 4),   (v_ton, v_cl, 4),
    (v_ton, v_gd, 10),  (v_ton, NULL, 8);

  -- Risk-Off (Σ=100): QUALITY 12.5 · VALUE 12.5 · UTILITIES 15 · GOLD 25 · Cash 35
  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight) VALUES
    (v_toff, v_ql, 12.5), (v_toff, v_va, 12.5), (v_toff, v_ut, 15),
    (v_toff, v_gd, 25),   (v_toff, NULL, 35);

  RETURN v_pid;
END;
$function$;

-- =========================================================================
-- 2) BLOCK CLIENT UPDATES ON PROTECTED COLUMNS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.block_protected_portfolio_updates()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
BEGIN
  IF current_setting('app.rpc_bypass', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.tracking_started_on IS DISTINCT FROM OLD.tracking_started_on THEN
    RAISE EXCEPTION 'tracking_started_on can only be updated by authoritative RPCs' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolios_protected ON public.portfolios;
CREATE TRIGGER trg_portfolios_protected
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.block_protected_portfolio_updates();

CREATE OR REPLACE FUNCTION public.block_protected_settings_updates()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
BEGIN
  IF current_setting('app.rpc_bypass', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.migration_completed IS DISTINCT FROM OLD.migration_completed
     OR NEW.last_applied_regime IS DISTINCT FROM OLD.last_applied_regime THEN
    RAISE EXCEPTION 'protected settings columns can only be updated by authoritative RPCs' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settings_protected ON public.portfolio_settings;
CREATE TRIGGER trg_settings_protected
  BEFORE UPDATE ON public.portfolio_settings
  FOR EACH ROW EXECUTE FUNCTION public.block_protected_settings_updates();

REVOKE EXECUTE ON FUNCTION public.block_protected_portfolio_updates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_protected_settings_updates() FROM PUBLIC;

-- =========================================================================
-- 3) mutation_requests: block all client access (RLS + no grants)
-- =========================================================================
REVOKE ALL ON TABLE public.mutation_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mutation_requests TO service_role;

-- =========================================================================
-- 4) INTERNAL: replay checks
-- =========================================================================
-- Verifies that after all currently visible operations, cash never goes negative
-- and no instrument quantity ever goes negative. Meant to be called inside RPC
-- after inserting the new operation, within the same transaction.
CREATE OR REPLACE FUNCTION public._replay_check(_pid uuid)
 RETURNS void LANGUAGE plpgsql SET search_path TO ''
AS $$
DECLARE
  v_min_cash numeric;
  v_min_cash_date date;
  v_bad_ins uuid;
  v_bad_ins_date date;
  v_bad_ins_qty numeric;
  v_ticker text;
BEGIN
  WITH reversed AS (
    SELECT reversal_of_operation_id AS oid
    FROM public.operations
    WHERE portfolio_id = _pid AND op_type = 'REVERSAL' AND reversal_of_operation_id IS NOT NULL
  ),
  active AS (
    SELECT o.*
    FROM public.operations o
    WHERE o.portfolio_id = _pid
      AND o.op_type <> 'REVERSAL'
      AND o.id NOT IN (SELECT oid FROM reversed)
  ),
  cash_flows AS (
    SELECT id, effective_date, recorded_at, seq,
      CASE op_type
        WHEN 'DEPOSIT'         THEN gross_amount_eur
        WHEN 'OPENING_CASH'    THEN gross_amount_eur
        WHEN 'DIVIDEND'        THEN gross_amount_eur
        WHEN 'OTHER_INCOME'    THEN gross_amount_eur
        WHEN 'WITHDRAW'        THEN -gross_amount_eur
        WHEN 'FEE'             THEN -gross_amount_eur
        WHEN 'BUY'             THEN -(gross_amount_eur + fees_eur)
        WHEN 'SELL'            THEN  (gross_amount_eur - fees_eur)
        ELSE 0::numeric
      END AS delta
    FROM active
  ),
  running_cash AS (
    SELECT effective_date,
      SUM(delta) OVER (ORDER BY effective_date, recorded_at, seq
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS c
    FROM cash_flows
  )
  SELECT MIN(c), (SELECT effective_date FROM running_cash r WHERE r.c = (SELECT MIN(c) FROM running_cash) ORDER BY effective_date LIMIT 1)
  INTO v_min_cash, v_min_cash_date
  FROM running_cash;

  IF v_min_cash IS NOT NULL AND v_min_cash < -0.005 THEN
    RAISE EXCEPTION 'insufficient cash: balance would become % on %', v_min_cash, v_min_cash_date USING ERRCODE = 'P0001';
  END IF;

  WITH reversed AS (
    SELECT reversal_of_operation_id AS oid FROM public.operations
    WHERE portfolio_id = _pid AND op_type='REVERSAL' AND reversal_of_operation_id IS NOT NULL
  ),
  active AS (
    SELECT o.* FROM public.operations o
    WHERE o.portfolio_id=_pid AND o.op_type<>'REVERSAL' AND o.id NOT IN (SELECT oid FROM reversed)
  ),
  qty_flows AS (
    SELECT instrument_id, effective_date, recorded_at, seq,
      CASE op_type
        WHEN 'BUY' THEN quantity
        WHEN 'SELL' THEN -quantity
        WHEN 'OPENING_POSITION' THEN quantity
        ELSE 0::numeric
      END AS dq
    FROM active
    WHERE instrument_id IS NOT NULL AND quantity IS NOT NULL
  ),
  running_q AS (
    SELECT instrument_id, effective_date,
      SUM(dq) OVER (PARTITION BY instrument_id ORDER BY effective_date, recorded_at, seq
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS q
    FROM qty_flows
  ),
  worst AS (
    SELECT instrument_id, MIN(q) AS mq,
      (ARRAY_AGG(effective_date ORDER BY q ASC, effective_date ASC))[1] AS bad_date
    FROM running_q GROUP BY instrument_id
  )
  SELECT instrument_id, bad_date, mq INTO v_bad_ins, v_bad_ins_date, v_bad_ins_qty
  FROM worst WHERE mq < -0.00005 ORDER BY mq ASC LIMIT 1;

  IF v_bad_ins IS NOT NULL THEN
    SELECT ticker INTO v_ticker FROM public.instruments WHERE id = v_bad_ins;
    RAISE EXCEPTION 'insufficient quantity on %: would become % on %', v_ticker, v_bad_ins_qty, v_bad_ins_date USING ERRCODE = 'P0001';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._replay_check(uuid) FROM PUBLIC;

-- =========================================================================
-- 5) INTERNAL: idempotency helpers
-- =========================================================================
-- Returns cached committed result if the (portfolio,rpc,key) already ran with
-- the same payload_hash; raises on mismatched hash; otherwise reserves the row
-- (status='in_progress') and returns NULL to signal the caller should proceed.
CREATE OR REPLACE FUNCTION public._idem_begin(
  _pid uuid, _rpc text, _key text, _hash text, OUT _mreq_id uuid, OUT _cached jsonb)
 LANGUAGE plpgsql SET search_path TO ''
AS $$
DECLARE
  v_existing_hash text;
  v_status text;
BEGIN
  INSERT INTO public.mutation_requests(portfolio_id, rpc_name, idempotency_key, payload_hash, status)
  VALUES (_pid, _rpc, _key, _hash, 'in_progress')
  ON CONFLICT (portfolio_id, rpc_name, idempotency_key) DO NOTHING
  RETURNING id INTO _mreq_id;

  IF _mreq_id IS NOT NULL THEN
    _cached := NULL; RETURN;
  END IF;

  SELECT id, payload_hash, status, result
    INTO _mreq_id, v_existing_hash, v_status, _cached
  FROM public.mutation_requests
  WHERE portfolio_id=_pid AND rpc_name=_rpc AND idempotency_key=_key
  FOR UPDATE;

  IF v_existing_hash <> _hash THEN
    RAISE EXCEPTION 'idempotency conflict: key % already used with a different payload', _key USING ERRCODE = '23505';
  END IF;

  IF v_status = 'committed' THEN
    RETURN;  -- caller returns _cached directly
  END IF;

  -- same hash, prior attempt uncommitted: safe to proceed and overwrite
  _cached := NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._idem_begin(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._idem_commit(_mreq_id uuid, _result jsonb)
 RETURNS void LANGUAGE sql SET search_path TO ''
AS $$
  UPDATE public.mutation_requests SET status='committed', result=_result WHERE id=_mreq_id;
$$;
REVOKE EXECUTE ON FUNCTION public._idem_commit(uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._owned_portfolio() RETURNS uuid
 LANGUAGE plpgsql SET search_path TO '' STABLE
AS $$
DECLARE v_pid uuid; v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_pid FROM public.portfolios WHERE user_id = v_uid;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'no portfolio for user' USING ERRCODE='42501'; END IF;
  RETURN v_pid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._owned_portfolio() FROM PUBLIC;

-- =========================================================================
-- 6) RPC: register_operation
-- Payload: { op_type, effective_date, instrument_id?, quantity?, price_ccy?,
--           currency?, fx_eur_per_unit?, gross_amount_eur?, fees_eur?, notes? }
-- =========================================================================
CREATE OR REPLACE FUNCTION public.register_operation(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
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
BEGIN
  v_pid := public._owned_portfolio();
  v_hash := md5(_payload::text);

  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'register_operation', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  -- Serialize concurrent mutations on the same portfolio
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

  -- Shape-specific server-authoritative computation
  IF v_op_type IN ('BUY','SELL') THEN
    v_instr := (_payload->>'instrument_id')::uuid;
    v_qty   := (_payload->>'quantity')::numeric;
    v_price := (_payload->>'price_ccy')::numeric;
    SELECT currency INTO v_inst_ccy FROM public.instruments WHERE id = v_instr AND portfolio_id = v_pid;
    IF v_inst_ccy IS NULL THEN RAISE EXCEPTION 'unknown instrument %', v_instr USING ERRCODE='22023'; END IF;
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
    -- DEPOSIT / WITHDRAW / FEE / OTHER_INCOME
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

  -- Validate the full ledger timeline (running cash & quantities never negative)
  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object('operation_id', v_op_id, 'gross_amount_eur', v_gross);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_operation(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_operation(text, jsonb) TO authenticated;

-- =========================================================================
-- 7) RPC: register_reversal
-- Payload: { operation_id, notes? }
-- payload_hash on (operation_id, notes)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.register_reversal(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
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

  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached FROM public._idem_begin(v_pid, 'register_reversal', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;

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
$$;
REVOKE EXECUTE ON FUNCTION public.register_reversal(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_reversal(text, jsonb) TO authenticated;

-- =========================================================================
-- 8) RPC: import_opening_balances
-- Payload: {
--   opening_date, opening_cash,
--   positions: [{instrument_id, quantity, average_cost_eur, opening_price_ccy, opening_fx?}],
--   fxs: [{currency, eur_per_unit}]
-- }
-- Each row idempotency_key = _key || ':' || suffix
-- =========================================================================
CREATE OR REPLACE FUNCTION public.import_opening_balances(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_batch uuid;
  v_open_date date;
  v_cash numeric;
  v_migrated boolean;
  v_track date;
  v_pos jsonb;
  v_fx  jsonb;
  v_idx int;
  v_inst uuid;
  v_qty numeric;
  v_avg_cost numeric;
  v_price numeric;
  v_open_fx numeric;
  v_inst_ccy public.currency_code;
  v_op_id uuid;
  v_ins_count int := 0;
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

  -- FX rates first (needed by opening prices for non-EUR instruments)
  IF _payload ? 'fxs' THEN
    FOR v_fx IN SELECT * FROM jsonb_array_elements(_payload->'fxs') LOOP
      INSERT INTO public.fx_rates(portfolio_id, currency, rate_date, eur_per_unit, source_batch_id)
      VALUES (v_pid, (v_fx->>'currency')::public.currency_code, v_open_date,
              (v_fx->>'eur_per_unit')::numeric, v_batch)
      ON CONFLICT (portfolio_id, currency, rate_date) DO UPDATE
        SET eur_per_unit = EXCLUDED.eur_per_unit, source_batch_id = EXCLUDED.source_batch_id;
    END LOOP;
  END IF;

  -- Positions
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

  -- Opening cash: only if strictly > 0
  IF v_cash > 0 THEN
    INSERT INTO public.operations(
      portfolio_id, op_type, gross_amount_eur, fees_eur, effective_date,
      source_batch_id, idempotency_key, payload_hash)
    VALUES (v_pid, 'OPENING_CASH', v_cash, 0, v_open_date, v_batch,
            _key || ':cash', md5(to_jsonb(v_cash)::text));
    v_ins_count := v_ins_count + 1;
  END IF;

  -- ATOMIC tracking + migration flag (even if lot is empty)
  PERFORM set_config('app.rpc_bypass','on', true);
  UPDATE public.portfolios SET tracking_started_on = v_open_date WHERE id = v_pid;
  UPDATE public.portfolio_settings SET migration_completed = true WHERE portfolio_id = v_pid;
  PERFORM set_config('app.rpc_bypass','off', true);

  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object(
    'batch_id', v_batch, 'opening_date', v_open_date, 'rows_created', v_ins_count);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_opening_balances(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_opening_balances(text, jsonb) TO authenticated;

-- =========================================================================
-- 9) RPC: amend_opening_import
-- Payload: { original_batch_id, opening_date, opening_cash, positions[], fxs[] }
-- Requires: no ORDINARY operations after tracking window opened (REVERSAL of
-- opening rows do NOT close the window).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.amend_opening_import(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_orig_batch uuid;
  v_new_batch uuid;
  v_open_date date;
  v_cash numeric;
  v_migrated boolean;
  v_bad_ops int;
  v_op public.operations%ROWTYPE;
  v_pos jsonb; v_fx jsonb;
  v_idx int := 0;
  v_inst uuid; v_qty numeric; v_avg_cost numeric; v_price numeric;
  v_open_fx numeric; v_inst_ccy public.currency_code;
  v_reversed_count int := 0;
  v_ins_count int := 0;
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

  -- Window must be open: NO ordinary ops exist
  SELECT count(*) INTO v_bad_ops FROM public.operations
   WHERE portfolio_id = v_pid
     AND op_type IN ('BUY','SELL','DEPOSIT','WITHDRAW','DIVIDEND','OTHER_INCOME','FEE');
  IF v_bad_ops > 0 THEN
    RAISE EXCEPTION 'amend window closed: % ordinary operation(s) exist', v_bad_ops USING ERRCODE='P0001';
  END IF;

  -- Reverse all opening ops from original batch that are not yet reversed
  FOR v_op IN
    SELECT * FROM public.operations
    WHERE portfolio_id = v_pid AND source_batch_id = v_orig_batch
      AND op_type IN ('OPENING_POSITION','OPENING_CASH')
      AND id NOT IN (SELECT reversal_of_operation_id FROM public.operations WHERE portfolio_id=v_pid AND op_type='REVERSAL' AND reversal_of_operation_id IS NOT NULL)
  LOOP
    INSERT INTO public.operations(
      portfolio_id, op_type, effective_date, fees_eur,
      reversal_of_operation_id, source_batch_id,
      idempotency_key, payload_hash)
    VALUES (v_pid, 'REVERSAL', v_op.effective_date, 0,
      v_op.id, v_new_batch,
      _key || ':rev:' || v_op.id, md5(v_op.id::text));
    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  -- Remove old opening prices/fx from original batch (manual data intact)
  DELETE FROM public.price_points WHERE source_batch_id = v_orig_batch;
  DELETE FROM public.fx_rates     WHERE source_batch_id = v_orig_batch;

  -- Insert new FX rates
  IF _payload ? 'fxs' THEN
    FOR v_fx IN SELECT * FROM jsonb_array_elements(_payload->'fxs') LOOP
      INSERT INTO public.fx_rates(portfolio_id, currency, rate_date, eur_per_unit, source_batch_id)
      VALUES (v_pid, (v_fx->>'currency')::public.currency_code, v_open_date,
              (v_fx->>'eur_per_unit')::numeric, v_new_batch)
      ON CONFLICT (portfolio_id, currency, rate_date) DO UPDATE
        SET eur_per_unit = EXCLUDED.eur_per_unit, source_batch_id = EXCLUDED.source_batch_id;
    END LOOP;
  END IF;

  -- Insert new opening positions
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

  PERFORM set_config('app.rpc_bypass','on', true);
  UPDATE public.portfolios SET tracking_started_on = v_open_date WHERE id = v_pid;
  PERFORM set_config('app.rpc_bypass','off', true);

  PERFORM public._replay_check(v_pid);

  DECLARE v_result jsonb := jsonb_build_object(
    'new_batch_id', v_new_batch, 'opening_date', v_open_date,
    'reversed_from_original', v_reversed_count, 'rows_created', v_ins_count);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.amend_opening_import(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amend_opening_import(text, jsonb) TO authenticated;
