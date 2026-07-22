import { Database } from 'lucide-react';
import { FeaturePlaceholder, INPUTS_PLACEHOLDER } from '@/components/common/FeaturePlaceholder';

// Gate F2 (Blocco C): la gestione reale di prezzi e cambi arriva in F3.
// Il contenuto mock non deve alimentare valorizzazioni né essere mostrato.
export default function InputsPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <Database className="h-7 w-7" /> Dati &amp; Prezzi
      </h1>
      <FeaturePlaceholder message={INPUTS_PLACEHOLDER} />
    </div>
  );
}
