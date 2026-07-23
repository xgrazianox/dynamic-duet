-- FASE 3 F3-0: save_target_set, persist_regime_decision, trigger protezione

CREATE OR REPLACE FUNCTION public.save_target_set(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid; v_regime public.regime; v_rows jsonb; v_canonical jsonb;
  v_hash text; v_mreq_id uuid; v_cached jsonb;
  v_cash_count int; v_row_count int; v_dup_count int;
  v_sum numeric; v_bad int; v_version int; v_ts_id uuid; v_eff date;
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
  SELECT jsonb_agg(r ORDER BY COALESCE(r->>'instrument_id',''), (r->>'weight'))
    INTO v_canonical FROM jsonb_array_elements(v_rows) AS r;
  v_hash := md5(jsonb_build_object('regime', v_regime, 'rows', v_canonical)::text);
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached
    FROM public._idem_begin(v_pid, 'save_target_set', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  CREATE TEMP TABLE _tmp_rows ON COMMIT DROP AS
  SELECT NULLIF(r->>'instrument_id','')::uuid AS instrument_id,
         (r->>'weight')::numeric AS weight
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
    AND ( i.id IS NULL OR i.status <> 'active'
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
  UPDATE public.target_sets SET status = 'superseded'
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

CREATE OR REPLACE FUNCTION public.persist_regime_decision(_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_actor uuid; v_pid uuid; v_month date;
  v_final public.regime; v_prev_final public.regime;
  v_is_switch boolean; v_id uuid; v_existing_id uuid;
BEGIN
  v_actor := (_payload->>'actor_user_id')::uuid;
  v_pid   := (_payload->>'portfolio_id')::uuid;
  IF v_actor IS NULL OR v_pid IS NULL THEN
    RAISE EXCEPTION 'persist_regime_decision: actor_user_id and portfolio_id required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portfolios WHERE id = v_pid AND user_id = v_actor) THEN
    RAISE EXCEPTION 'persist_regime_decision: portfolio % does not belong to actor', v_pid USING ERRCODE='42501';
  END IF;
  v_month := (_payload->>'as_of_month')::date;
  v_final := NULLIF(_payload->>'final_regime','')::public.regime;
  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;
  SELECT id INTO v_existing_id FROM public.regime_decisions
   WHERE portfolio_id = v_pid AND as_of_month = v_month
     AND config_hash = (_payload->>'config_hash')
     AND input_fingerprint = (_payload->>'input_fingerprint');
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('decision_id', v_existing_id, 'idempotent', true);
  END IF;
  IF v_final IS NULL THEN
    v_is_switch := false;
  ELSE
    SELECT final_regime INTO v_prev_final
    FROM public.regime_decisions
    WHERE portfolio_id = v_pid AND final_regime IS NOT NULL AND as_of_month < v_month
    ORDER BY as_of_month DESC LIMIT 1;
    v_is_switch := (v_prev_final IS NOT NULL AND v_prev_final <> v_final);
  END IF;
  INSERT INTO public.regime_decisions (
    portfolio_id, as_of_month, regime_a, regime_b, final_regime,
    decision_mode, config, config_hash, input_fingerprint, engine_version, is_switch)
  VALUES (
    v_pid, v_month,
    NULLIF(_payload->>'regime_a','')::public.regime,
    NULLIF(_payload->>'regime_b','')::public.regime,
    v_final,
    _payload->>'decision_mode',
    _payload->'config',
    _payload->>'config_hash',
    _payload->>'input_fingerprint',
    _payload->>'engine_version',
    v_is_switch)
  ON CONFLICT (portfolio_id, as_of_month, config_hash, input_fingerprint) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.regime_decisions
     WHERE portfolio_id = v_pid AND as_of_month = v_month
       AND config_hash = (_payload->>'config_hash')
       AND input_fingerprint = (_payload->>'input_fingerprint');
    RETURN jsonb_build_object('decision_id', v_id, 'idempotent', true);
  END IF;
  RETURN jsonb_build_object('decision_id', v_id, 'is_switch', v_is_switch, 'idempotent', false);
END;
$$;
REVOKE ALL ON FUNCTION public.persist_regime_decision(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_regime_decision(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.block_protected_price_points()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
BEGIN
  IF current_user = 'postgres' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'opening' OR OLD.source_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'price_points: opening/batch rows cannot be deleted by clients' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.source = 'opening' OR OLD.source_batch_id IS NOT NULL) THEN
    RAISE EXCEPTION 'price_points: opening/batch rows are immutable for clients' USING ERRCODE='42501';
  END IF;
  IF NEW.source = 'opening' THEN
    RAISE EXCEPTION 'price_points: clients cannot create opening rows' USING ERRCODE='42501';
  END IF;
  IF NEW.source_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'price_points: clients cannot assign source_batch_id' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_protected_price_points() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_price_points_protected ON public.price_points;
CREATE TRIGGER trg_price_points_protected
  BEFORE INSERT OR UPDATE OR DELETE ON public.price_points
  FOR EACH ROW EXECUTE FUNCTION public.block_protected_price_points();

CREATE OR REPLACE FUNCTION public.block_protected_instruments()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
BEGIN
  IF current_user = 'postgres' THEN RETURN NEW; END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.quantity_step IS DISTINCT FROM OLD.quantity_step
     OR NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id THEN
    IF EXISTS (SELECT 1 FROM public.operations WHERE instrument_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.price_points WHERE instrument_id = OLD.id) THEN
      RAISE EXCEPTION 'instrument %: currency/quantity_step/portfolio_id immutable once referenced', OLD.id USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    IF EXISTS (
      SELECT 1 FROM public.target_allocations ta
      JOIN public.target_sets ts ON ts.id = ta.target_set_id
      WHERE ta.instrument_id = OLD.id AND ts.status = 'active' AND ta.weight > 0
    ) THEN
      RAISE EXCEPTION 'instrument %: cannot archive with positive weight in an active target', OLD.id USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_protected_instruments() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_instruments_protected ON public.instruments;
CREATE TRIGGER trg_instruments_protected
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.block_protected_instruments();

CREATE OR REPLACE FUNCTION public.block_instrument_delete()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
BEGIN
  IF current_user = 'postgres' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'instruments: physical delete not allowed; archive instead' USING ERRCODE='42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_instrument_delete() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_instruments_no_delete ON public.instruments;
CREATE TRIGGER trg_instruments_no_delete
  BEFORE DELETE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.block_instrument_delete();

CREATE OR REPLACE FUNCTION public.block_protected_fx_rates()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
BEGIN
  IF current_user = 'postgres' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'fx_rates: batch (opening) rows cannot be deleted by clients' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'fx_rates: batch (opening) rows are immutable for clients' USING ERRCODE='42501';
  END IF;
  IF NEW.source_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'fx_rates: clients cannot assign source_batch_id' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_protected_fx_rates() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_fx_rates_protected ON public.fx_rates;
CREATE TRIGGER trg_fx_rates_protected
  BEFORE INSERT OR UPDATE OR DELETE ON public.fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.block_protected_fx_rates();