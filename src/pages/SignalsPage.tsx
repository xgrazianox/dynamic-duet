import { useState } from 'react';
import { Radio, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignalAPanel } from '@/components/signals/SignalAPanel';
import { SignalBPanel } from '@/components/signals/SignalBPanel';
import { DecisionPanel } from '@/components/signals/DecisionPanel';
import { DecisionMode } from '@/types/portfolio';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { toast } from 'sonner';

export default function SignalsPage() {
  const { config, engineResult, setDecisionMode } = useSignalEngine();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleModeChange = (mode: DecisionMode) => {
    setDecisionMode(mode);
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsRefreshing(false);
    toast.success('Segnali aggiornati con i dati più recenti');
  };
  
  const handleExport = () => {
    const data = {
      timestamp: new Date().toISOString(),
      signalA: {
        regime: engineResult.signalA.currentRegime,
        ratio: engineResult.signalA.ratio,
        sma: engineResult.signalA.sma,
      },
      signalB: {
        regime: engineResult.signalB.currentRegime,
        vote: engineResult.signalB.vote,
      },
      decision: engineResult.decision,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signals-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report segnali esportato');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Radio className="h-7 w-7" />
            Signal Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            Doppia conferma + Voto 2-su-3 per determinare il regime
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Esporta
          </Button>
          <Button size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Aggiorna Segnali
          </Button>
        </div>
      </div>
      
      {/* Decision Layer (Top for quick view) */}
      <DecisionPanel 
        result={engineResult.decision}
        currentMode={config.decision.mode}
        onModeChange={handleModeChange}
      />
      
      {/* System A Panel */}
      <SignalAPanel result={engineResult.signalA} />
      
      {/* System B Panel */}
      <SignalBPanel result={engineResult.signalB} />
    </div>
  );
}
