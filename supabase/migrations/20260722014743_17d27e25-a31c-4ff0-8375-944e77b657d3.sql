-- Cleanup E2E and stale fixture user data (F1 closing)
DO $$
DECLARE v_uids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_uids FROM auth.users
    WHERE email ILIKE 'e2e-%@example.com' OR email ILIKE 'f1b-%@example.com';
  IF v_uids IS NULL THEN RETURN; END IF;
  DELETE FROM public.mutation_requests WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  DELETE FROM public.target_allocations WHERE target_set_id IN (SELECT id FROM public.target_sets WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids)));
  DELETE FROM public.target_sets     WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  DELETE FROM public.regime_decisions WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  DELETE FROM public.fx_rates         WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  DELETE FROM public.price_points     WHERE instrument_id IN (SELECT id FROM public.instruments WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids)));
  ALTER TABLE public.operations DISABLE TRIGGER USER;
  DELETE FROM public.operations       WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  ALTER TABLE public.operations ENABLE TRIGGER USER;
  DELETE FROM public.instruments      WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  DELETE FROM public.portfolio_settings WHERE portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = ANY(v_uids));
  DELETE FROM public.portfolios       WHERE user_id = ANY(v_uids);
  DELETE FROM auth.users              WHERE id = ANY(v_uids);
END $$;