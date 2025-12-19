import { useState, useMemo } from 'react';
import { Radio, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignalAPanel } from '@/components/signals/SignalAPanel';
import { SignalBPanel } from '@/components/signals/SignalBPanel';
import { DecisionPanel } from '@/components/signals/DecisionPanel';
import { runSignalEngine } from '@/lib/signalEngine';
import { DecisionMode, SignalEngineConfig, defaultSignalEngineConfig } from '@/types/portfolio';
import { toast } from 'sonner';

// Generate mock price data for signal engine
const generateMockPrices = () => {
  const months = 24;
  const msciBase = 85;
  const goldBase = 55;
  
  const msciPrices: number[] = [msciBase];
  const goldPrices: number[] = [goldBase];
  const dates: string[] = [];
  
  for (let i = 0; i < months; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - (months - 1 - i));
    dates.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`);
    
    if (i > 0) {
      // Add some trend and volatility
      const msciChange = (Math.random() - 0.45) * 0.06 * msciPrices[i - 1];
      const goldChange = (Math.random() - 0.48) * 0.04 * goldPrices[i - 1];
      msciPrices.push(Math.max(msciPrices[i - 1] + msciChange, msciBase * 0.7));
      goldPrices.push(Math.max(goldPrices[i - 1] + goldChange, goldBase * 0.7));
    }
  }
  
  return { msciPrices, goldPrices, dates };
};

const mockData = generateMockPrices();

export default function SignalsPage() {
  const [config, setConfig] = useState<SignalEngineConfig>(defaultSignalEngineConfig);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const engineResult = useMemo(() => {
    return runSignalEngine(
      mockData.msciPrices,
      mockData.goldPrices,
      mockData.dates,
      config
    );
  }, [config]);
  
  const handleModeChange = (mode: DecisionMode) => {
    setConfig(prev => ({
      ...prev,
      decision: { ...prev.decision, mode }
    }));
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
