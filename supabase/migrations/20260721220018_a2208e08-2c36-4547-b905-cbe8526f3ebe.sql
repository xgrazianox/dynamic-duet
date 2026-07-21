
ALTER TABLE public.operations DISABLE TRIGGER USER;

WITH puids AS (
  SELECT id FROM public.portfolios
  WHERE user_id IN (
    '92ea8433-91ae-41cf-b067-abe9d7d30de2',
    '3c398e51-0d6a-459c-ba7e-416cf3dd243d'
  )
)
DELETE FROM public.target_allocations WHERE target_set_id IN (
  SELECT id FROM public.target_sets WHERE portfolio_id IN (SELECT id FROM puids)
);
DELETE FROM public.target_sets WHERE portfolio_id IN (
  SELECT id FROM public.portfolios WHERE user_id IN (
    '92ea8433-91ae-41cf-b067-abe9d7d30de2','3c398e51-0d6a-459c-ba7e-416cf3dd243d'
  )
);
DELETE FROM public.operations WHERE portfolio_id IN (
  SELECT id FROM public.portfolios WHERE user_id IN (
    '92ea8433-91ae-41cf-b067-abe9d7d30de2','3c398e51-0d6a-459c-ba7e-416cf3dd243d'
  )
);
DELETE FROM public.instruments WHERE portfolio_id IN (
  SELECT id FROM public.portfolios WHERE user_id IN (
    '92ea8433-91ae-41cf-b067-abe9d7d30de2','3c398e51-0d6a-459c-ba7e-416cf3dd243d'
  )
);
DELETE FROM public.portfolio_settings WHERE portfolio_id IN (
  SELECT id FROM public.portfolios WHERE user_id IN (
    '92ea8433-91ae-41cf-b067-abe9d7d30de2','3c398e51-0d6a-459c-ba7e-416cf3dd243d'
  )
);
DELETE FROM public.portfolios WHERE user_id IN (
  '92ea8433-91ae-41cf-b067-abe9d7d30de2','3c398e51-0d6a-459c-ba7e-416cf3dd243d'
);
DELETE FROM auth.users WHERE id IN (
  '92ea8433-91ae-41cf-b067-abe9d7d30de2','3c398e51-0d6a-459c-ba7e-416cf3dd243d'
);

ALTER TABLE public.operations ENABLE TRIGGER USER;
