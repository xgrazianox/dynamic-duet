import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { PortfolioPosition, SLEEVES } from '@/types/portfolio';

interface PortfolioSummaryProps {
  positions: PortfolioPosition[];
}

export function PortfolioSummary({ positions }: PortfolioSummaryProps) {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValueEur, 0);
  
  // Mock performance data
  const dailyChange = 0.0032;
  const monthlyChange = 0.0185;

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-glow">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="stat-label">Valore Portafoglio</p>
          <p className="stat-value">€{totalValue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            {dailyChange >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-risk-on" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-destructive" />
            )}
            <span className="text-xs text-muted-foreground">Oggi</span>
          </div>
          <p className={`font-mono font-semibold ${dailyChange >= 0 ? 'positive' : 'negative'}`}>
            {dailyChange >= 0 ? '+' : ''}{(dailyChange * 100).toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            {monthlyChange >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-risk-on" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-destructive" />
            )}
            <span className="text-xs text-muted-foreground">Mese</span>
          </div>
          <p className={`font-mono font-semibold ${monthlyChange >= 0 ? 'positive' : 'negative'}`}>
            {monthlyChange >= 0 ? '+' : ''}{(monthlyChange * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Quick allocation breakdown */}
      <div>
        <p className="text-xs text-muted-foreground mb-3">Allocazione per Categoria</p>
        <div className="space-y-2">
          {['CORE', 'FACTOR', 'THEME', 'HEDGE', 'CASH'].map(category => {
            const categoryPositions = positions.filter(p => {
              const sleeve = SLEEVES[p.sleeveKey];
              return sleeve?.category === category;
            });
            const categoryValue = categoryPositions.reduce((sum, p) => sum + p.marketValueEur, 0);
            const percentage = (categoryValue / totalValue) * 100;
            
            return (
              <div key={category} className="flex items-center gap-3">
                <div className="w-16 text-xs text-muted-foreground">{category}</div>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="w-12 text-right font-mono text-xs">{percentage.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
