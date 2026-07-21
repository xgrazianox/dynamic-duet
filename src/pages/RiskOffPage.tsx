import { Shield, Info } from 'lucide-react';
import { mockTargetsRiskOff } from '@/lib/mockData';
import { SLEEVES } from '@/types/portfolio';
import { useSignalEngine } from '@/contexts/SignalEngineContext';

export default function RiskOffPage() {
  const totalWeight = mockTargetsRiskOff.reduce((sum, t) => sum + t.baseWeight, 0);
  const { finalRegime } = useSignalEngine();
  const isActive = finalRegime === 'RISK_OFF';

  // Group by category
  const categories = ['HEDGE', 'CASH', 'FACTOR', 'THEME'];
  const grouped = categories.map(cat => ({
    category: cat,
    items: mockTargetsRiskOff.filter(t => SLEEVES[t.sleeveKey]?.category === cat)
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Shield className="h-7 w-7 text-risk-off" />
            Portafoglio Target RISK-OFF
          </h1>
          <p className="text-muted-foreground mt-1">
            Allocazione quando Ratio MSCI/Gold ≤ SMA(10)
          </p>
        </div>
        {isActive && (
          <span className="regime-badge-off px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-current animate-pulse-subtle" />
            Regime Attivo
          </span>
        )}
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
        <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="mb-2">
            <strong className="text-foreground">Strategia Risk-Off:</strong> allocazione difensiva con 
            forte esposizione a oro, liquidità e settori stabili come utilities.
          </p>
          <p>
            <strong className="text-foreground">Formula Magica ETF:</strong> mantiene lo sleeve Quality + Value 
            come equity controllata anche in modalità difensiva.
          </p>
        </div>
      </div>

      {/* Allocation by category */}
      {grouped.map(group => {
        const categoryWeight = group.items.reduce((sum, t) => sum + t.baseWeight, 0);
        
        return (
          <div key={group.category} className="rounded-xl border border-border bg-card card-glow overflow-hidden">
            <div className="p-4 border-b border-border bg-secondary/30 flex items-center justify-between">
              <h3 className="font-semibold">{group.category}</h3>
              <span className="font-mono text-sm">{(categoryWeight * 100).toFixed(1)}%</span>
            </div>
            <div className="divide-y divide-border">
              {group.items.map(target => {
                const sleeve = SLEEVES[target.sleeveKey];
                
                return (
                  <div key={target.id} className="flex items-center p-4 hover:bg-accent/30 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium">{sleeve?.name || target.sleeveKey}</p>
                    </div>
                    <div className="w-48 mx-4">
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div 
                          className="h-full bg-risk-off transition-all duration-500"
                          style={{ width: `${target.baseWeight * 100 * 2}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right">
                      <span className="font-mono font-semibold">
                        {(target.baseWeight * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Total */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <span className="font-semibold">Totale Allocazione</span>
        <span className={`font-mono text-lg font-bold ${
          Math.abs(totalWeight - 1) < 0.001 ? 'text-risk-on' : 'text-destructive'
        }`}>
          {(totalWeight * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
