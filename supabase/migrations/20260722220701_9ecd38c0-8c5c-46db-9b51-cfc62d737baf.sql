-- HOTFIX BLOCCO B-BIS: security_invoker su instruments_v + revoca privilegi eccessivi sulle viste

ALTER VIEW public.instruments_v SET (security_invoker = true);

-- Revoca privilegi eccessivi (INSERT/UPDATE/DELETE/TRUNCATE) e anon su tutte le viste _v
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['fx_rates_v','instruments_v','operations_v','price_points_v','target_allocations_v'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM service_role', v);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
  END LOOP;
END $$;