import { Shield } from 'lucide-react';
import { FeaturePlaceholder, TARGETS_PLACEHOLDER } from '@/components/common/FeaturePlaceholder';

// Gate F2 (Blocco C): configurazione dei target strategici in F3. Nessun target mock mostrato.
export default function RiskOffPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <Shield className="h-7 w-7 text-sky-600" /> Target Risk-Off
      </h1>
      <FeaturePlaceholder message={TARGETS_PLACEHOLDER} />
    </div>
  );
}
