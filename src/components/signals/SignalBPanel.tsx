import { TrendingUp, TrendingDown, AlertCircle, Vote, Activity, BarChart3 } from 'lucide-react';
import { SignalBResult } from '@/types/portfolio';

interface SignalBPanelProps {
  result: SignalBResult;
  confirmMonths?: number;
  minVotesRequired?: number;
  b1SmaMonths?: number;
  b2SmaMonths?: number;
  b3VolLookback?: number;
  b3VolThreshold?: number;
}

export function SignalBPanel({
  result,
  confirmMonths = 2,
  minVotesRequired = 2,
  b1SmaMonths = 10,
  b2SmaMonths = 10,
  b3VolLookback = 6,
  b3VolThreshold = 0.18,
}: SignalBPanelProps) {
  const { currentRegime, vote, confirmCount, reason, history } = result;
  
  const isRiskOn = currentRegime === 'RISK_ON';
  const isUndetermined = currentRegime === 'UNDETERMINED';

  const getSignalBadge = (signal: string) => {
    const baseClasses = "px-2 py-0.5 rounded text-xs font-medium";
    if (signal === 'ON') return `${baseClasses} bg-risk-on/20 text-risk-on`;
    if (signal === 'OFF') return `${baseClasses} bg-risk-off/20 text-risk-off`;
    return `${baseClasses} bg-muted text-muted-foreground`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-glow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="text-primary">Sistema B</span>
            <span className="text-muted-foreground">— Voto {minVotesRequired}-su-3</span>
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Majority vote su 3 segnali indipendenti
          </p>
        </div>
        
        {/* Regime Badge */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
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
      
      {/* Current Vote Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* B1: Ratio Trend */}
        <div className="p-4 rounded-lg bg-secondary border border-border">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">B1: Ratio Trend</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">MSCI/Gold vs SMA({b1SmaMonths})</p>
          <span className={getSignalBadge(vote.b1)}>{vote.b1}</span>
        </div>
        
        {/* B2: Equity Trend */}
        <div className="p-4 rounded-lg bg-secondary border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">B2: Equity Trend</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">MSCI vs SMA({b2SmaMonths})</p>
          <span className={getSignalBadge(vote.b2)}>{vote.b2}</span>
        </div>
        
        {/* B3: Volatility */}
        <div className="p-4 rounded-lg bg-secondary border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">B3: Volatilità</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Realized vol {b3VolLookback}m &gt; {(b3VolThreshold * 100).toFixed(0)}%</p>
          <span className={getSignalBadge(vote.b3)}>{vote.b3}</span>
        </div>
      </div>
      
      {/* Vote Result */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50 border border-border mb-6">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
          vote.rawSignal === 'ON' ? 'bg-risk-on/20 text-risk-on' :
          vote.rawSignal === 'OFF' ? 'bg-risk-off/20 text-risk-off' :
          'bg-muted text-muted-foreground'
        }`}>
          <Vote className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <p className="font-medium">
              Voto: {vote.onCount} ON / {vote.offCount} OFF
            </p>
            <span className={getSignalBadge(vote.rawSignal)}>
              Raw: {vote.rawSignal}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Conferma {confirmCount}/{confirmMonths} — {reason}
          </p>
        </div>
      </div>
      
      {/* History Table */}
      <div>
        <h4 className="text-sm font-medium mb-3">Ultimi 12 mesi</h4>
        <div className="overflow-x-auto">
          <table className="data-table text-xs">
            <thead>
              <tr>
                <th>Mese</th>
                <th>B1</th>
                <th>B2</th>
                <th>B3</th>
                <th>Voto</th>
                <th>Regime</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(-12).reverse().map((h, i) => (
                <tr key={i}>
                  <td className="font-mono">{h.date.slice(0, 7)}</td>
                  <td><span className={getSignalBadge(h.b1Signal)}>{h.b1Signal}</span></td>
                  <td><span className={getSignalBadge(h.b2Signal)}>{h.b2Signal}</span></td>
                  <td><span className={getSignalBadge(h.b3Signal)}>{h.b3Signal}</span></td>
                  <td>
                    <span className="font-mono text-muted-foreground">
                      {h.vote.onCount}/{h.vote.offCount}
                    </span>
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      h.confirmedRegime === 'RISK_ON' ? 'bg-risk-on/20 text-risk-on' :
                      h.confirmedRegime === 'RISK_OFF' ? 'bg-risk-off/20 text-risk-off' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {h.confirmedRegime === 'RISK_ON' ? 'ON' : h.confirmedRegime === 'RISK_OFF' ? 'OFF' : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
