import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Regime } from '@/types/portfolio';

interface RegimeCardProps {
  regime: Regime;
  ratio: number;
  sma10: number;
}

export function RegimeCard({ regime, ratio, sma10 }: RegimeCardProps) {
  const isRiskOn = regime === 'RISK_ON';
  const isUndetermined = regime === 'UNDETERMINED';

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 card-glow">
      {/* Background gradient */}
      <div 
        className={`absolute inset-0 opacity-10 ${
          isUndetermined 
            ? 'bg-muted' 
            : isRiskOn 
              ? 'bg-gradient-to-br from-risk-on to-transparent' 
              : 'bg-gradient-to-br from-risk-off to-transparent'
        }`} 
      />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <span className="stat-label">Regime Corrente</span>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
            isUndetermined 
              ? 'bg-muted text-muted-foreground' 
              : isRiskOn 
                ? 'regime-badge-on' 
                : 'regime-badge-off'
          }`}>
            {isUndetermined ? (
              <AlertCircle className="h-4 w-4" />
            ) : isRiskOn ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {isUndetermined ? 'Non Determinato' : isRiskOn ? 'RISK-ON' : 'RISK-OFF'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Ratio MSCI/Gold</p>
            <p className="font-mono text-xl font-semibold">{ratio.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">SMA(10)</p>
            <p className="font-mono text-xl font-semibold">{sma10.toFixed(3)}</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {isUndetermined 
              ? 'Dati insufficienti per determinare il regime'
              : `Ratio ${isRiskOn ? 'sopra' : 'sotto'} la media mobile a 10 mesi`
            }
          </p>
        </div>
      </div>
    </div>
  );
}
