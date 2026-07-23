-- =========================================================================
-- FASE 5 — BLOCCO F5-0: eventi di regime
-- 1) RPC acknowledge_regime_event : presa visione di uno switch (solo ack)
-- 2) RPC mark_regime_applied      : marca il regime applicato (solo settings)
-- Convenzioni identiche alle RPC F1/F3: SECURITY DEFINER, search_path='',
-- oggetti qualificati public.*, lock FOR UPDATE, idempotenza mutation_requests.
-- Nessuna scrittura client diretta; nessun bypass permanente dei trigger
-- (trg_settings_protected consente l'update SOLO perché la RPC gira come
-- 'postgres', owner — lo stesso meccanismo già usato da import/amend).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) acknowledge_regime_event(_key, _payload{decision_id})
--    Presa visione di un evento switch. NON tocca last_applied_regime.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_regime_event(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid;
  v_uid uuid;
  v_decision_id uuid;
  v_canonical jsonb;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_dec public.regime_decisions%ROWTYPE;
BEGIN
  v_pid := public._owned_portfolio();  -- identità SOLO da auth.uid()
  v_uid := auth.uid();

  v_decision_id := (_payload->>'decision_id')::uuid;
  IF v_decision_id IS NULL THEN
    RAISE EXCEPTION 'acknowledge_regime_event: decision_id required' USING ERRCODE='22023';
  END IF;

  v_canonical := jsonb_build_object('decision_id', v_decision_id);
  v_hash := md5(v_canonical::text);
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached
    FROM public._idem_begin(v_pid, 'acknowledge_regime_event', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;

  SELECT * INTO v_dec FROM public.regime_decisions
   WHERE id = v_decision_id AND portfolio_id = v_pid
   FOR UPDATE;
  IF v_dec.id IS NULL THEN
    RAISE EXCEPTION 'acknowledge_regime_event: decision % not found for this portfolio', v_decision_id USING ERRCODE='42501';
  END IF;
  IF NOT v_dec.is_switch THEN
    RAISE EXCEPTION 'acknowledge_regime_event: decision % is not a switch event', v_decision_id USING ERRCODE='22023';
  END IF;

  IF v_dec.acknowledged_at IS NOT NULL THEN
    -- già acknowledged: restituisce lo stato senza duplicare effetti
    DECLARE v_res jsonb := jsonb_build_object(
      'decision_id', v_dec.id, 'acknowledged', true, 'already_acknowledged', true,
      'acknowledged_at', v_dec.acknowledged_at);
    BEGIN
      PERFORM public._idem_commit(v_mreq_id, v_res);
      RETURN v_res;
    END;
  END IF;

  UPDATE public.regime_decisions
     SET acknowledged_at = now(), acknowledged_by = v_uid
   WHERE id = v_dec.id;

  DECLARE v_result jsonb := jsonb_build_object(
    'decision_id', v_dec.id, 'acknowledged', true, 'already_acknowledged', false);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.acknowledge_regime_event(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_regime_event(text, jsonb) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2) mark_regime_applied(_key, _payload{decision_id})
--    Marca last_applied_regime = final_regime dell'ULTIMA decisione determinata.
--    Il decision_id del client serve SOLO come guardia anti-obsolescenza:
--    il regime NON è mai scelto dal client. NON tocca acknowledged_at/by.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_regime_applied(_key text, _payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_pid uuid;
  v_decision_id uuid;
  v_canonical jsonb;
  v_hash text;
  v_mreq_id uuid;
  v_cached jsonb;
  v_latest_id uuid;
  v_latest_regime public.regime;
  v_current public.regime;
BEGIN
  v_pid := public._owned_portfolio();

  v_decision_id := (_payload->>'decision_id')::uuid;
  IF v_decision_id IS NULL THEN
    RAISE EXCEPTION 'mark_regime_applied: decision_id required' USING ERRCODE='22023';
  END IF;

  v_canonical := jsonb_build_object('decision_id', v_decision_id);
  v_hash := md5(v_canonical::text);
  SELECT _mreq_id, _cached INTO v_mreq_id, v_cached
    FROM public._idem_begin(v_pid, 'mark_regime_applied', _key, v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  PERFORM 1 FROM public.portfolios WHERE id = v_pid FOR UPDATE;

  -- Ultima decisione DETERMINATA individuata SERVER-SIDE
  SELECT id, final_regime INTO v_latest_id, v_latest_regime
    FROM public.regime_decisions
   WHERE portfolio_id = v_pid AND final_regime IS NOT NULL
   ORDER BY as_of_month DESC, decided_at DESC
   LIMIT 1;

  IF v_latest_id IS NULL THEN
    RAISE EXCEPTION 'mark_regime_applied: no determined decision exists' USING ERRCODE='P0001';
  END IF;
  IF v_latest_id <> v_decision_id THEN
    RAISE EXCEPTION 'mark_regime_applied: decision % is stale — latest determined is %', v_decision_id, v_latest_id USING ERRCODE='P0001';
  END IF;

  SELECT last_applied_regime INTO v_current
    FROM public.portfolio_settings WHERE portfolio_id = v_pid;

  IF v_current IS NOT DISTINCT FROM v_latest_regime THEN
    DECLARE v_res jsonb := jsonb_build_object(
      'applied_regime', v_latest_regime, 'already_applied', true, 'decision_id', v_latest_id);
    BEGIN
      PERFORM public._idem_commit(v_mreq_id, v_res);
      RETURN v_res;
    END;
  END IF;

  -- Consentito dal trigger trg_settings_protected perché current_user='postgres'
  UPDATE public.portfolio_settings
     SET last_applied_regime = v_latest_regime
   WHERE portfolio_id = v_pid;

  DECLARE v_result jsonb := jsonb_build_object(
    'applied_regime', v_latest_regime, 'already_applied', false, 'decision_id', v_latest_id);
  BEGIN
    PERFORM public._idem_commit(v_mreq_id, v_result);
    RETURN v_result;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_regime_applied(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_regime_applied(text, jsonb) TO authenticated, service_role;
