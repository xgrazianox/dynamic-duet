import { supabase } from '@/integrations/supabase/client';

/** Invocatore RPC tipizzato (F6-r2): niente `any`. Le RPC non presenti nei tipi
 * generati da Lovable passano da QUESTO unico punto, con firma dichiarata. */
export type RpcName =
  | 'register_operation' | 'register_reversal'
  | 'import_opening_balances' | 'amend_opening_import'
  | 'save_target_set' | 'acknowledge_regime_event'
  | 'mark_regime_applied' | 'update_portfolio_settings';

interface RpcError { message: string }
interface RpcResponse<T> { data: T | null; error: RpcError | null }
type RpcInvoker = (fn: RpcName, args: { _key: string; _payload: unknown }) => PromiseLike<RpcResponse<unknown>>;

const invoke = (supabase as unknown as { rpc: RpcInvoker }).rpc.bind(supabase);

export async function callRpc<T>(fn: RpcName, key: string, payload: unknown): Promise<T> {
  const { data, error } = await invoke(fn, { _key: key, _payload: payload });
  if (error) throw new Error(error.message);
  return data as T;
}

/** Hash deterministico compatto (djb2) per chiavi di idempotenza stabili per contenuto. */
export function contentKey(prefix: string, canonical: string): string {
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h + canonical.charCodeAt(i)) >>> 0;
  return `${prefix}:${h.toString(36)}`;
}
