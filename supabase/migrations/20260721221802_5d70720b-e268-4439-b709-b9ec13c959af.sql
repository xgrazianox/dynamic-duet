
REVOKE EXECUTE ON FUNCTION public.register_operation(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_reversal(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.import_opening_balances(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.amend_opening_import(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public._replay_check(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._idem_begin(uuid, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._idem_commit(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._owned_portfolio() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_protected_portfolio_updates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_protected_settings_updates() FROM anon, authenticated;
