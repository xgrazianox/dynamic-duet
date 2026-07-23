import { TrendingUp } from 'lucide-react';
import { TargetEditor } from '@/components/targets/TargetEditor';

// F3-B: editor del target strategico Risk-On su save_target_set (versionato, atomico).
export default function RiskOnPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <TrendingUp className="h-7 w-7 text-emerald-600" /> Target Risk-On
      </h1>
      <TargetEditor regime="RISK_ON" />
    </div>
  );
}
