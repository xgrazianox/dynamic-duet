import { Shield } from 'lucide-react';
import { TargetEditor } from '@/components/targets/TargetEditor';

// F3-B: editor del target strategico Risk-Off su save_target_set (versionato, atomico).
export default function RiskOffPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <Shield className="h-7 w-7 text-sky-600" /> Target Risk-Off
      </h1>
      <TargetEditor regime="RISK_OFF" />
    </div>
  );
}
