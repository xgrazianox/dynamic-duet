import { Radio } from 'lucide-react';
import { FeaturePlaceholder, SIGNAL_ENGINE_PLACEHOLDER } from '@/components/common/FeaturePlaceholder';

// Gate F2 (Blocco C): il Signal Engine gira ancora su dati mock e NON deve essere
// mostrato in modalità reale. La logica legacy resta nella storia git (ripristino in F3).
export default function SignalsPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <Radio className="h-7 w-7" /> Signal Engine
      </h1>
      <FeaturePlaceholder message={SIGNAL_ENGINE_PLACEHOLDER} />
    </div>
  );
}
