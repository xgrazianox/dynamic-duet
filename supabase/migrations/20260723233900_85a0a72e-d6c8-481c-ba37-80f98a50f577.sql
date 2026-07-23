-- =========================================================================
-- F6 — Allineamento ordine transazionale di save_target_set:
--   proprietà → LOCK portfolio → idempotenza → validazioni → mutazione
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_target_set(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid;
  v_regime public.regime;
  v_rows jsonb;
  v_canonical jsonb;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_cash_count int;
  v_row_count int;
  v_dup_count int;
  v_sum numeric;
  v_bad int;
  v_version int;
  v_ts_id uuid;
  v_eff date;
BEGIN
  v_pid := public._owned_portfolio();

  v_regime := (_payload->>'regime')::public.regime;
  IF v_regime IS NULL THEN
    RAISE EXCEPTION 'save_target_set: regime required (RISK_ON|RISK_OFF)' USING ERRCODE='22023';
  END IF;

  v_rows := _payload->'rows';
  IF v_rows IS NULL OR jsonb_typeof(v_rows) <> 'array' THEN
    RAISE EXCEPTION 'save_target_set: rows array required' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;

  SELECT jsonb_agg(r ORDER BY COALESCE(r->>'instrument_id',''), (r->>'weight'))
    INTO v_canonical
  FROM jsonb_array_elements(v_rows) AS r;
  v_hash := md5(jsonb_build_object('regime', v_regime, 'rows', v_canonical)::text);

  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached
    FROM public._idem_begin(v_pid, 'save_target_set', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  CREATE TEMP TABLE _tmp_rows ON COMMIT DROP AS
  SELECT
    NULLIF(r->>'instrument_id','')::uuid AS instrument_id,
    (r->>'weight')::numeric               AS weight
  FROM jsonb_array_elements(v_rows) AS r;

  SELECT count(*) INTO v_row_count FROM _tmp_rows;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'save_target_set: at least one row required' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_bad FROM _tmp_rows WHERE weight IS NULL OR weight < 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'save_target_set: weights must be present and >= 0' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_cash_count FROM _tmp_rows WHERE instrument_id IS NULL;
  IF v_cash_count <> 1 THEN
    RAISE EXCEPTION 'save_target_set: exactly one Cash row (instrument_id NULL) required, got %', v_cash_count USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_dup_count FROM (
    SELECT instrument_id FROM _tmp_rows WHERE instrument_id IS NOT NULL
    GROUP BY instrument_id HAVING count(*) > 1
  ) d;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'save_target_set: duplicate instrument in rows' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_bad
  FROM _tmp_rows t
  LEFT JOIN public.instruments i
    ON i.id = t.instrument_id AND i.portfolio_id = v_pid
  WHERE t.instrument_id IS NOT NULL
    AND ( i.id IS NULL
       OR i.status <> 'active'
       OR NOT ( i.regime_class = 'BOTH'
                OR (v_regime = 'RISK_ON'  AND i.regime_class = 'AGGRESSIVE')
                OR (v_regime = 'RISK_OFF' AND i.regime_class = 'DEFENSIVE') ) );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'save_target_set: % row(s) reference unknown, archived, or regime-incompatible instruments', v_bad USING ERRCODE='22023';
  END IF;

  SELECT sum(weight) INTO v_sum FROM _tmp_rows;
  IF v_sum <> 100 THEN
    RAISE EXCEPTION 'save_target_set: weights must sum to exactly 100 (got %)', v_sum USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(max(version),0) + 1 INTO v_version
  FROM public.target_sets WHERE portfolio_id = v_pid AND regime = v_regime;

  v_eff := CURRENT_DATE;

  UPDATE public.target_sets
     SET status = 'superseded'
   WHERE portfolio_id = v_pid AND regime = v_regime
     AND status IN ('active','draft');

  INSERT INTO public.target_sets (portfolio_id, regime, version, effective_from, status)
  VALUES (v_pid, v_regime, v_version, v_eff, 'active')
  RETURNING id INTO v_ts_id;

  INSERT INTO public.target_allocations (target_set_id, instrument_id, weight)
  SELECT v_ts_id, instrument_id, weight FROM _tmp_rows;

  DECLARE v_result jsonb := jsonb_build_object(
    'target_set_id', v_ts_id, 'regime', v_regime,
    'version', v_version, 'effective_from', v_eff);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.save_target_set(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_target_set(text, jsonb) TO authenticated, service_role;