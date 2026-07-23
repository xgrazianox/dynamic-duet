CREATE OR REPLACE FUNCTION public.update_portfolio_settings(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid;
  v_canonical jsonb := '{}'::jsonb;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_k text;
  v_allowed text[] := ARRAY['tolerance_pp','rounding_eur','min_trade_eur','take_profit_pct',
                            'stale_price_days','default_fx','simulated_fee_eur',
                            'msci_instrument_id','gold_instrument_id','engine_config'];
  v_forbidden text[] := ARRAY['migration_completed','last_applied_regime','tilt_enabled'];
  v_num numeric; v_int int; v_fx jsonb; v_ccy text;
  v_msci uuid; v_gold uuid; v_cnt int;
  v_ec jsonb; v_a jsonb; v_b jsonb; v_mode text;
  v_cur public.portfolio_settings%ROWTYPE;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  v_pid := public._owned_portfolio();

  FOR v_k IN SELECT jsonb_object_keys(_payload) LOOP
    IF v_k = ANY(v_forbidden) THEN
      RAISE EXCEPTION 'update_portfolio_settings: field % is system-managed and cannot be updated', v_k USING ERRCODE='42501';
    END IF;
    IF NOT (v_k = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'update_portfolio_settings: unknown field %', v_k USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(_payload)) = 0 THEN
    RAISE EXCEPTION 'update_portfolio_settings: empty payload' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;

  SELECT COALESCE(jsonb_object_agg(k, _payload->k ORDER BY k), '{}'::jsonb)
    INTO v_canonical FROM jsonb_object_keys(_payload) AS k;
  v_hash := md5(v_canonical::text);
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached
    FROM public._idem_begin(v_pid, 'update_portfolio_settings', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  SELECT * INTO v_cur FROM public.portfolio_settings WHERE portfolio_id = v_pid FOR UPDATE;

  IF _payload ? 'tolerance_pp' THEN
    v_num := (_payload->>'tolerance_pp')::numeric;
    IF v_num IS NULL OR v_num < 0 OR v_num > 100 THEN RAISE EXCEPTION 'tolerance_pp out of range' USING ERRCODE='22023'; END IF;
  END IF;
  IF _payload ? 'rounding_eur' THEN
    v_num := (_payload->>'rounding_eur')::numeric;
    IF v_num IS NULL OR v_num <= 0 THEN RAISE EXCEPTION 'rounding_eur must be positive' USING ERRCODE='22023'; END IF;
  END IF;
  IF _payload ? 'min_trade_eur' THEN
    v_num := (_payload->>'min_trade_eur')::numeric;
    IF v_num IS NULL OR v_num <= 0 THEN RAISE EXCEPTION 'min_trade_eur must be positive' USING ERRCODE='22023'; END IF;
  END IF;
  IF _payload ? 'take_profit_pct' THEN
    v_num := (_payload->>'take_profit_pct')::numeric;
    IF v_num IS NULL OR v_num <= 0 THEN RAISE EXCEPTION 'take_profit_pct must be positive' USING ERRCODE='22023'; END IF;
  END IF;
  IF _payload ? 'stale_price_days' THEN
    IF jsonb_typeof(_payload->'stale_price_days') <> 'number'
       OR (_payload->>'stale_price_days')::numeric <> floor((_payload->>'stale_price_days')::numeric)
       OR (_payload->>'stale_price_days')::numeric <= 0 THEN
      RAISE EXCEPTION 'stale_price_days must be a positive integer' USING ERRCODE='22023';
    END IF;
  END IF;
  IF _payload ? 'simulated_fee_eur' THEN
    v_num := (_payload->>'simulated_fee_eur')::numeric;
    IF v_num IS NULL OR v_num < 0 THEN RAISE EXCEPTION 'simulated_fee_eur must be >= 0' USING ERRCODE='22023'; END IF;
  END IF;
  IF _payload ? 'default_fx' THEN
    v_fx := _payload->'default_fx';
    IF jsonb_typeof(v_fx) <> 'object' THEN RAISE EXCEPTION 'default_fx must be an object' USING ERRCODE='22023'; END IF;
    FOR v_ccy IN SELECT jsonb_object_keys(v_fx) LOOP
      IF v_ccy NOT IN ('USD','CHF') THEN RAISE EXCEPTION 'default_fx: only USD and CHF allowed (got %)', v_ccy USING ERRCODE='22023'; END IF;
      IF jsonb_typeof(v_fx->v_ccy) <> 'number' OR (v_fx->>v_ccy)::numeric <= 0 THEN
        RAISE EXCEPTION 'default_fx.% must be a positive number', v_ccy USING ERRCODE='22023';
      END IF;
    END LOOP;
  END IF;
  v_msci := COALESCE(NULLIF(_payload->>'msci_instrument_id','')::uuid, v_cur.msci_instrument_id);
  v_gold := COALESCE(NULLIF(_payload->>'gold_instrument_id','')::uuid, v_cur.gold_instrument_id);
  IF (_payload ? 'msci_instrument_id') OR (_payload ? 'gold_instrument_id') THEN
    IF v_msci IS NOT NULL THEN
      SELECT count(*) INTO v_cnt FROM public.instruments WHERE id=v_msci AND portfolio_id=v_pid AND status='active';
      IF v_cnt = 0 THEN RAISE EXCEPTION 'msci_instrument_id: not an active instrument of this portfolio' USING ERRCODE='22023'; END IF;
    END IF;
    IF v_gold IS NOT NULL THEN
      SELECT count(*) INTO v_cnt FROM public.instruments WHERE id=v_gold AND portfolio_id=v_pid AND status='active';
      IF v_cnt = 0 THEN RAISE EXCEPTION 'gold_instrument_id: not an active instrument of this portfolio' USING ERRCODE='22023'; END IF;
    END IF;
    IF v_msci IS NOT NULL AND v_gold IS NOT NULL AND v_msci = v_gold THEN
      RAISE EXCEPTION 'msci and gold drivers must be distinct instruments' USING ERRCODE='22023';
    END IF;
  END IF;
  IF _payload ? 'engine_config' THEN
    v_ec := _payload->'engine_config';
    IF jsonb_typeof(v_ec) <> 'object' THEN RAISE EXCEPTION 'engine_config must be an object' USING ERRCODE='22023'; END IF;
    v_mode := v_ec->>'decision_mode';
    IF v_mode IS NULL OR v_mode NOT IN ('USE_A','USE_B','A_AND_B','A_OR_B','A_PRIORITY') THEN
      RAISE EXCEPTION 'engine_config.decision_mode invalid' USING ERRCODE='22023';
    END IF;
    v_a := v_ec->'signalA'; v_b := v_ec->'signalB';
    IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'engine_config: signalA and signalB required' USING ERRCODE='22023'; END IF;
    FOREACH v_k IN ARRAY ARRAY['smaMonths','confirmMonths'] LOOP
      IF jsonb_typeof(v_a->v_k) <> 'number' OR (v_a->>v_k)::numeric <> floor((v_a->>v_k)::numeric) OR (v_a->>v_k)::numeric <= 0 THEN
        RAISE EXCEPTION 'engine_config.signalA.% must be a positive integer', v_k USING ERRCODE='22023';
      END IF;
    END LOOP;
    FOREACH v_k IN ARRAY ARRAY['b1SmaMonths','b2SmaMonths','b3VolLookback','minVotesRequired','confirmMonths'] LOOP
      IF jsonb_typeof(v_b->v_k) <> 'number' OR (v_b->>v_k)::numeric <> floor((v_b->>v_k)::numeric) OR (v_b->>v_k)::numeric <= 0 THEN
        RAISE EXCEPTION 'engine_config.signalB.% must be a positive integer', v_k USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(v_a->'bandPct') <> 'number' OR (v_a->>'bandPct')::numeric < 0 THEN
      RAISE EXCEPTION 'engine_config.signalA.bandPct invalid' USING ERRCODE='22023'; END IF;
    FOREACH v_k IN ARRAY ARRAY['b1BandPct','b2BandPct'] LOOP
      IF jsonb_typeof(v_b->v_k) <> 'number' OR (v_b->>v_k)::numeric < 0 THEN
        RAISE EXCEPTION 'engine_config.signalB.% invalid', v_k USING ERRCODE='22023'; END IF;
    END LOOP;
    IF jsonb_typeof(v_b->'b3VolThreshold') <> 'number' OR (v_b->>'b3VolThreshold')::numeric <= 0 THEN
      RAISE EXCEPTION 'engine_config.signalB.b3VolThreshold invalid' USING ERRCODE='22023'; END IF;
    IF (v_b->>'minVotesRequired')::int NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'engine_config.signalB.minVotesRequired must be in 1..3' USING ERRCODE='22023'; END IF;
  END IF;

  IF (NOT _payload ? 'tolerance_pp'      OR (_payload->>'tolerance_pp')::numeric      = v_cur.tolerance_pp)
   AND (NOT _payload ? 'rounding_eur'     OR (_payload->>'rounding_eur')::numeric      = v_cur.rounding_eur)
   AND (NOT _payload ? 'min_trade_eur'    OR (_payload->>'min_trade_eur')::numeric     = v_cur.min_trade_eur)
   AND (NOT _payload ? 'take_profit_pct'  OR (_payload->>'take_profit_pct')::numeric   = v_cur.take_profit_pct)
   AND (NOT _payload ? 'stale_price_days' OR (_payload->>'stale_price_days')::int      = v_cur.stale_price_days)
   AND (NOT _payload ? 'simulated_fee_eur' OR (_payload->>'simulated_fee_eur')::numeric = v_cur.simulated_fee_eur)
   AND (NOT _payload ? 'default_fx'       OR (_payload->'default_fx')                  = v_cur.default_fx)
   AND (NOT _payload ? 'msci_instrument_id' OR v_msci IS NOT DISTINCT FROM v_cur.msci_instrument_id)
   AND (NOT _payload ? 'gold_instrument_id' OR v_gold IS NOT DISTINCT FROM v_cur.gold_instrument_id)
   AND (NOT _payload ? 'engine_config'    OR (_payload->'engine_config')               = v_cur.engine_config)
  THEN
    DECLARE v_noop jsonb := jsonb_build_object('updated', false, 'noop', true);
    BEGIN
      PERFORM public._idem_commit(v_mreq_id, v_noop);
      RETURN v_noop;
    END;
  END IF;

  UPDATE public.portfolio_settings SET
    tolerance_pp      = CASE WHEN _payload ? 'tolerance_pp'      THEN (_payload->>'tolerance_pp')::numeric      ELSE tolerance_pp END,
    rounding_eur      = CASE WHEN _payload ? 'rounding_eur'      THEN (_payload->>'rounding_eur')::numeric      ELSE rounding_eur END,
    min_trade_eur     = CASE WHEN _payload ? 'min_trade_eur'     THEN (_payload->>'min_trade_eur')::numeric     ELSE min_trade_eur END,
    take_profit_pct   = CASE WHEN _payload ? 'take_profit_pct'   THEN (_payload->>'take_profit_pct')::numeric   ELSE take_profit_pct END,
    stale_price_days  = CASE WHEN _payload ? 'stale_price_days'  THEN (_payload->>'stale_price_days')::int      ELSE stale_price_days END,
    simulated_fee_eur = CASE WHEN _payload ? 'simulated_fee_eur' THEN (_payload->>'simulated_fee_eur')::numeric ELSE simulated_fee_eur END,
    default_fx        = CASE WHEN _payload ? 'default_fx'        THEN _payload->'default_fx'                    ELSE default_fx END,
    msci_instrument_id= CASE WHEN _payload ? 'msci_instrument_id' THEN v_msci                                   ELSE msci_instrument_id END,
    gold_instrument_id= CASE WHEN _payload ? 'gold_instrument_id' THEN v_gold                                   ELSE gold_instrument_id END,
    engine_config     = CASE WHEN _payload ? 'engine_config'     THEN _payload->'engine_config'                 ELSE engine_config END
  WHERE portfolio_id = v_pid;

  SELECT array_agg(k ORDER BY k) INTO v_changed FROM jsonb_object_keys(_payload) k;
  DECLARE v_result jsonb := jsonb_build_object('updated', true, 'noop', false, 'fields', to_jsonb(v_changed));
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.update_portfolio_settings(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_portfolio_settings(text, jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS psettings_upd_own ON public.portfolio_settings;
REVOKE UPDATE ON public.portfolio_settings FROM authenticated;