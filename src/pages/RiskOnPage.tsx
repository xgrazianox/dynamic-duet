import { TrendingUp, Info } from 'lucide-react';
import { mockTargetsRiskOn, mockStrategyState } from '@/lib/mockData';
import { SLEEVES } from '@/types/portfolio';
import { useSignalEngine } from '@/contexts/SignalEngineContext';

export default function RiskOnPage() {
  const totalWeight = mockTargetsRiskOn.reduce((sum, t) => sum + t.baseWeight, 0);
  const { finalRegime } = useSignalEngine();
  const isActive = finalRegime === 'RISK_ON';

  // Group by category
  const categories = ['CORE', 'FACTOR', 'THEME', 'HEDGE', 'CASH'];
  const grouped = categories.map(cat => ({
    category: cat,
    items: mockTargetsRiskOn.filter(t => SLEEVES[t.sleeveKey]?.category === cat)
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-risk-on" />
            Portafoglio Target RISK-ON
          </h1>
          <p className="text-muted-foreground mt-1">
            Allocazione applicata quando il regime finale del Signal Engine è RISK-ON
          </p>
        </div>
        {isActive && (
          <span className="regime-badge-on px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
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
            <strong className="text-foreground">Strategia Risk-On:</strong> allocazione orientata alla crescita 
            con esposizione a equity globale, settori tematici e quality/value factor.
          </p>
          <p>
            <strong className="text-foreground">Tilt Contrarian:</strong> fino a 2 temi satellite possono ricevere 
            un bonus del 2% ciascuno se sottoperformanti (-15% vs MSCI 12m) e trend positivo (prezzo &gt; SMA10).
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
                const hasThemeBonus = 
                  mockStrategyState.theme1Selected === target.sleeveKey && mockStrategyState.theme1Eligible ||
                  mockStrategyState.theme2Selected === target.sleeveKey && mockStrategyState.theme2Eligible;
                
                return (
                  <div key={target.id} className="flex items-center p-4 hover:bg-accent/30 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium">{sleeve?.name || target.sleeveKey}</p>
                      {hasThemeBonus && (
                        <span className="text-xs text-primary">+2% tilt contrarian applicato</span>
                      )}
                    </div>
                    <div className="w-48 mx-4">
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500"
                          style={{ width: `${target.baseWeight * 100 * 2}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right">
                      <span className="font-mono font-semibold">
                        {(target.baseWeight * 100).toFixed(1)}%
                      </span>
                      {hasThemeBonus && (
                        <span className="text-xs text-primary ml-1">+2%</span>
                      )}
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
