-- UTILITY DI TEST — NON DISTRIBUIBILE
-- Reset completo dei due portafogli personali (autorizzato dalla direzione:
-- entrambi gli account sono di prova). Esegui con service_role, mai come
-- migration. Vedi scripts/test-utilities/README.md per la governance.

DO $$
DECLARE
  v_uids uuid[];
  v_pids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_uids FROM auth.users;
  SELECT array_agg(id) INTO v_pids FROM public.portfolios;
  IF v_pids IS NULL THEN RETURN; END IF;

  DELETE FROM public.mutation_requests WHERE portfolio_id = ANY(v_pids);
  DELETE FROM public.target_allocations
    WHERE target_set_id IN (SELECT id FROM public.target_sets WHERE portfolio_id = ANY(v_pids));
  DELETE FROM public.target_sets     WHERE portfolio_id = ANY(v_pids);
  DELETE FROM public.regime_decisions WHERE portfolio_id = ANY(v_pids);
  DELETE FROM public.fx_rates         WHERE portfolio_id = ANY(v_pids);
  DELETE FROM public.price_points
    WHERE instrument_id IN (SELECT id FROM public.instruments WHERE portfolio_id = ANY(v_pids));

  -- Il trigger append-only blocca DELETE su operations. Disabilitazione
  -- SCOPED alla sola transazione dell'utility, mai in una migration.
  ALTER TABLE public.operations DISABLE TRIGGER USER;
  DELETE FROM public.operations WHERE portfolio_id = ANY(v_pids);
  ALTER TABLE public.operations ENABLE TRIGGER USER;

  DELETE FROM public.instruments        WHERE portfolio_id = ANY(v_pids);
  DELETE FROM public.portfolio_settings WHERE portfolio_id = ANY(v_pids);
  DELETE FROM public.portfolios         WHERE id = ANY(v_pids);
  DELETE FROM auth.users                WHERE id = ANY(v_uids);
END $$;