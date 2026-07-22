import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { OperationModal } from '@/components/operations/OperationModal';
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

interface Ctx {
  open: (prefill?: OperationPrefill) => void;
}

const OperationModalCtx = createContext<Ctx | null>(null);

export function OperationModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<OperationPrefill | undefined>(undefined);
  const open = useCallback((p?: OperationPrefill) => { setPrefill(p); setIsOpen(true); }, []);
  return (
    <OperationModalCtx.Provider value={{ open }}>
      {children}
      <OperationModal open={isOpen} onOpenChange={setIsOpen} prefill={prefill} />
    </OperationModalCtx.Provider>
  );
}

export function useOperationModal(): Ctx {
  const ctx = useContext(OperationModalCtx);
  if (!ctx) throw new Error('useOperationModal deve stare dentro <OperationModalProvider>');
  return ctx;
}