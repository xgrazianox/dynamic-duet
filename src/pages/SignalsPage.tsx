import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Radio, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignalAPanel } from '@/components/signals/SignalAPanel';
import { SignalBPanel } from '@/components/signals/SignalBPanel';
import { DecisionPanel } from '@/components/signals/DecisionPanel';
import { DecisionMode } from '@/types/portfolio';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { useAppState } from '@/contexts/AppStateContext';
import { parseDeepLinkParams } from '@/lib/alertRouting';
import { toast } from 'sonner';

export default function SignalsPage() {
  const { config, engineResult, setDecisionMode } = useSignalEngine();
  const { resolveAlert } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [highlightedPanel, setHighlightedPanel] = useState<string | null>(null);
  const decisionRef = useRef<HTMLDivElement>(null);
  const signalARef = useRef<HTMLDivElement>(null);
  const signalBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dl = parseDeepLinkParams(searchParams);
    if (dl.panel) {
      setHighlightedPanel(dl.panel);
      setTimeout(() => {
        const el =
          dl.panel === 'signalA' ? signalARef.current :
          dl.panel === 'signalB' ? signalBRef.current :
          decisionRef.current;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      setTimeout(() => setHighlightedPanel(null), 3000);
    }
    // OPEN_SIGNALS_VIEW: only scroll + highlight, do NOT auto-resolve the alert.
    if (dl.panel || dl.alertId) {
      const next = new URLSearchParams(searchParams);
      next.delete('alertId');
      next.delete('panel');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const ringClass = (name: string) =>
    highlightedPanel === name ? 'ring-2 ring-primary rounded-lg animate-pulse' : '';

  const handleModeChange = (mode: DecisionMode) => {
    setDecisionMode(mode);
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsRefreshing(false);
    toast.success('Segnali ricalcolati con la configurazione corrente');
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
      <div ref={decisionRef} className={ringClass('decision')}>
        <DecisionPanel 
          result={engineResult.decision}
          currentMode={config.decision.mode}
          onModeChange={handleModeChange}
        />
      </div>

      {/* System A Panel */}
      <div ref={signalARef} className={ringClass('signalA')}>
        <SignalAPanel
          result={engineResult.signalA}
          smaMonths={config.signalA.smaMonths}
          confirmMonths={config.signalA.confirmMonths}
          bandPct={config.signalA.bandPct}
        />
      </div>

      {/* System B Panel */}
      <div ref={signalBRef} className={ringClass('signalB')}>
        <SignalBPanel
          result={engineResult.signalB}
          confirmMonths={config.signalB.confirmMonths}
          minVotesRequired={config.signalB.minVotesRequired}
          b1SmaMonths={config.signalB.b1SmaMonths}
          b2SmaMonths={config.signalB.b2SmaMonths}
          b3VolLookback={config.signalB.b3VolLookback}
          b3VolThreshold={config.signalB.b3VolThreshold}
        />
      </div>
    </div>
  );
}
