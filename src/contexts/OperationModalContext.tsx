import { useCallback, useState, type ReactNode } from 'react';
import { OperationModal } from '@/components/operations/OperationModal';
import { OperationModalContext, type OperationPrefill } from './operationModalStore';

export function OperationModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<OperationPrefill | undefined>(undefined);
  const open = useCallback((p?: OperationPrefill) => { setPrefill(p); setIsOpen(true); }, []);
  return (
    <OperationModalContext.Provider value={{ open }}>
      {children}
      <OperationModal open={isOpen} onOpenChange={setIsOpen} prefill={prefill} />
    </OperationModalContext.Provider>
  );
}
