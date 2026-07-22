import { createContext, useContext } from 'react';
import type { OpKind } from '@/domain/operationPreview';

export interface OperationPrefill {
  kind?: OpKind;
  instrumentId?: string;
  quantity?: string;
  priceCcy?: string;
  grossAmountEur?: string;
  notes?: string;
  closePosition?: boolean;
  onSuccess?: () => void;
}

export interface OperationModalCtx {
  open: (prefill?: OperationPrefill) => void;
}

export const OperationModalContext = createContext<OperationModalCtx | null>(null);

export function useOperationModal(): OperationModalCtx {
  const ctx = useContext(OperationModalContext);
  if (!ctx) throw new Error('useOperationModal deve stare dentro <OperationModalProvider>');
  return ctx;
}
