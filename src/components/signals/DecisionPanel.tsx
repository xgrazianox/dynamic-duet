import { TrendingUp, TrendingDown, AlertCircle, AlertTriangle, Layers } from 'lucide-react';
import { DecisionResult, DecisionMode } from '@/types/portfolio';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DecisionPanelProps {
  result: DecisionResult;
  currentMode: DecisionMode;
  onModeChange: (mode: DecisionMode) => void;
}

const modeLabels: Record<DecisionMode, string> = {
  USE_A: 'Usa solo Sistema A',
  USE_B: 'Usa solo Sistema B',
  A_AND_B: 'A + B (AND conservativo)',
  A_OR_B: 'A + B (OR aggressivo)',
  A_PRIORITY: 'A prioritario (B tiebreak)',
};

const modeDescriptions: Record<DecisionMode, string> = {
  USE_A: 'Il regime finale è determinato esclusivamente dal Sistema A (Doppia Conferma MSCI/Gold)',
  USE_B: 'Il regime finale è determinato esclusivamente dal Sistema B (Voto 2-su-3)',
  A_AND_B: 'RISK-ON solo se entrambi i sistemi concordano. Approccio difensivo.',
  A_OR_B: 'RISK-ON se almeno uno dei sistemi indica ON. Approccio aggressivo.',
  A_PRIORITY: 'Sistema A ha priorità. B usato solo se A non è determinato.',
};

export function DecisionPanel({ result, currentMode, onModeChange }: DecisionPanelProps) {
  const { finalRegime, regimeA, regimeB, hasConflict, reason } = result;
  
  const isRiskOn = finalRegime === 'RISK_ON';
  const isUndetermined = finalRegime === 'UNDETERMINED';

  const getRegimeBadge = (regime: string, size: 'sm' | 'lg' = 'sm') => {
    const sizeClasses = size === 'lg' ? 'px-4 py-2 text-sm' : 'px-2 py-1 text-xs';
    if (regime === 'RISK_ON') return `${sizeClasses} rounded-full font-semibold bg-risk-on/20 text-risk-on`;
    if (regime === 'RISK_OFF') return `${sizeClasses} rounded-full font-semibold bg-risk-off/20 text-risk-off`;
    return `${sizeClasses} rounded-full font-semibold bg-muted text-muted-foreground`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-glow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Decision Layer
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Combinazione dei segnali e regime finale
          </p>
        </div>
      </div>
      
      {/* Mode Selector */}
      <div className="mb-6 p-4 rounded-lg bg-secondary/50 border border-border">
        <label className="text-sm font-medium mb-2 block">Modalità di Decisione</label>
        <Select value={currentMode} onValueChange={(v) => onModeChange(v as DecisionMode)}>
          <SelectTrigger className="w-full md:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(modeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          {modeDescriptions[currentMode]}
        </p>
      </div>
      
      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* System A */}
        <div className="p-4 rounded-lg bg-secondary border border-border text-center">
          <p className="text-sm text-muted-foreground mb-2">Sistema A</p>
          <span className={getRegimeBadge(regimeA)}>
            {regimeA === 'RISK_ON' ? 'RISK-ON' : regimeA === 'RISK_OFF' ? 'RISK-OFF' : 'Non Det.'}
          </span>
        </div>
        
        {/* System B */}
        <div className="p-4 rounded-lg bg-secondary border border-border text-center">
          <p className="text-sm text-muted-foreground mb-2">Sistema B</p>
          <span className={getRegimeBadge(regimeB)}>
            {regimeB === 'RISK_ON' ? 'RISK-ON' : regimeB === 'RISK_OFF' ? 'RISK-OFF' : 'Non Det.'}
          </span>
        </div>
        
        {/* Final */}
        <div className={`p-4 rounded-lg border text-center ${
          isRiskOn ? 'bg-risk-on/10 border-risk-on/30' : 
          isUndetermined ? 'bg-secondary border-border' :
          'bg-risk-off/10 border-risk-off/30'
        }`}>
          <p className="text-sm text-muted-foreground mb-2">Regime Finale</p>
          <span className={getRegimeBadge(finalRegime, 'lg')}>
            {isUndetermined ? (
              <>
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Non Determinato
              </>
            ) : isRiskOn ? (
              <>
                <TrendingUp className="h-4 w-4 inline mr-1" />
                RISK-ON
              </>
            ) : (
              <>
                <TrendingDown className="h-4 w-4 inline mr-1" />
                RISK-OFF
              </>
            )}
          </span>
        </div>
      </div>
      
      {/* Conflict Warning */}
      {hasConflict && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-risk-off/10 border border-risk-off/30 mb-4">
          <AlertTriangle className="h-5 w-5 text-risk-off" />
          <div>
            <p className="font-medium text-risk-off">Conflitto tra sistemi</p>
            <p className="text-sm text-muted-foreground">
              Sistema A e Sistema B indicano regimi diversi. Il regime finale segue la modalità selezionata.
            </p>
          </div>
        </div>
      )}
      
      {/* Reason */}
      <div className="p-4 rounded-lg bg-secondary/50 border border-border">
        <p className="text-sm font-medium mb-1">Motivazione</p>
        <p className="text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
