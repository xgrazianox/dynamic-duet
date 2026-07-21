import { useState } from 'react';
import { Settings, Database, Clock, Key, Save, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppState } from '@/contexts/AppStateContext';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { strategyConfig, setStrategyConfig } = useAppState();
  const { config: engineConfig, updateConfig } = useSignalEngine();
  const [config, setConfig] = useState(strategyConfig);
  const [signalCfg, setSignalCfg] = useState(engineConfig);
  const [apiKey, setApiKey] = useState('');
  const [updateFrequency, setUpdateFrequency] = useState('daily');

  const handleSave = () => {
    setStrategyConfig(config);
    // Sync Signal A SMA months with the strategy SMA months per requirement.
    updateConfig((prev) => ({
      ...prev,
      signalA: { ...prev.signalA, smaMonths: config.smaMonths, bandPct: signalCfg.signalA.bandPct, confirmMonths: signalCfg.signalA.confirmMonths },
      signalB: { ...prev.signalB, ...signalCfg.signalB },
    }));
    toast.success('Impostazioni salvate con successo');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Settings className="h-7 w-7" />
          Impostazioni
        </h1>
        <p className="text-muted-foreground mt-1">
          Configurazione strategia e provider dati
        </p>
      </div>

      {/* Strategy Parameters */}
      <div className="rounded-xl border border-border bg-card p-6 card-glow">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Parametri Strategia
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="smaMonths">Mesi per SMA</Label>
            <Input
              id="smaMonths"
              type="number"
              value={config.smaMonths}
              onChange={(e) => setConfig({...config, smaMonths: parseInt(e.target.value)})}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Periodi per la media mobile del ratio MSCI/Gold
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="underperformance">Soglia Sottoperformance (%)</Label>
            <Input
              id="underperformance"
              type="number"
              step="0.01"
              value={config.underperformanceThreshold * 100}
              onChange={(e) => setConfig({...config, underperformanceThreshold: parseFloat(e.target.value) / 100})}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Tema deve sottoperformare MSCI di questa % per eleggibilità
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="themeBonus">Bonus Tema (%)</Label>
            <Input
              id="themeBonus"
              type="number"
              step="0.5"
              value={config.themeBonusPercent * 100}
              onChange={(e) => setConfig({...config, themeBonusPercent: parseFloat(e.target.value) / 100})}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Percentuale bonus per tema eleggibile
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxThemes">Max Temi</Label>
            <Input
              id="maxThemes"
              type="number"
              value={config.maxThemes}
              onChange={(e) => setConfig({...config, maxThemes: parseInt(e.target.value)})}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Numero massimo di temi con tilt contemporaneo
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="takeProfit">Soglia Take Profit (%)</Label>
            <Input
              id="takeProfit"
              type="number"
              step="5"
              value={config.takeProfitThreshold * 100}
              onChange={(e) => setConfig({...config, takeProfitThreshold: parseFloat(e.target.value) / 100})}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Deviazione dal target che attiva take profit
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rounding">Arrotondamento Trade (€)</Label>
            <Input
              id="rounding"
              type="number"
              step="10"
              value={config.tradeRoundingAmount}
              onChange={(e) => setConfig({...config, tradeRoundingAmount: parseInt(e.target.value)})}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              I trade vengono arrotondati a questo multiplo
            </p>
          </div>
        </div>
      </div>

      {/* Signal Engine */}
      <div className="rounded-xl border border-border bg-card p-6 card-glow">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          Signal Engine
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label>Sistema A: Banda ±%</Label>
            <Input
              type="number"
              step="0.1"
              value={signalCfg.signalA.bandPct * 100}
              onChange={(e) => setSignalCfg({ ...signalCfg, signalA: { ...signalCfg.signalA, bandPct: parseFloat(e.target.value) / 100 } })}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Sistema A: Mesi Conferma</Label>
            <Input
              type="number"
              value={signalCfg.signalA.confirmMonths}
              onChange={(e) => setSignalCfg({ ...signalCfg, signalA: { ...signalCfg.signalA, confirmMonths: parseInt(e.target.value) } })}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Sistema B: Voti Minimi</Label>
            <Input
              type="number"
              min={1}
              max={3}
              value={signalCfg.signalB.minVotesRequired}
              onChange={(e) => setSignalCfg({ ...signalCfg, signalB: { ...signalCfg.signalB, minVotesRequired: parseInt(e.target.value) } })}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>B3: Soglia Volatilità (%)</Label>
            <Input
              type="number"
              step="1"
              value={signalCfg.signalB.b3VolThreshold * 100}
              onChange={(e) => setSignalCfg({ ...signalCfg, signalB: { ...signalCfg.signalB, b3VolThreshold: parseFloat(e.target.value) / 100 } })}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>B3: Lookback (mesi)</Label>
            <Input
              type="number"
              value={signalCfg.signalB.b3VolLookback}
              onChange={(e) => setSignalCfg({ ...signalCfg, signalB: { ...signalCfg.signalB, b3VolLookback: parseInt(e.target.value) } })}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {/* Data Provider */}
      <div className="rounded-xl border border-border bg-card p-6 card-glow">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          Provider Dati
        </h3>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider Quotazioni</Label>
            <select 
              id="provider"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2"
            >
              <option value="yahoo">Yahoo Finance</option>
              <option value="twelvedata">Twelve Data</option>
              <option value="alphavantage">Alpha Vantage</option>
              <option value="stooq">Stooq</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (opzionale)</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Inserisci API key..."
            />
            <p className="text-xs text-muted-foreground">
              Alcune API richiedono una chiave per funzionare
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm">
              Test Connessione
            </Button>
            <span className="text-sm text-muted-foreground">
              Stato: <span className="text-risk-on">Connesso</span>
            </span>
          </div>
        </div>
      </div>

      {/* Update Frequency */}
      <div className="rounded-xl border border-border bg-card p-6 card-glow">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Frequenza Aggiornamento
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {['daily', 'weekly', 'manual'].map((freq) => (
              <label key={freq} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="frequency"
                  value={freq}
                  checked={updateFrequency === freq}
                  onChange={(e) => setUpdateFrequency(e.target.value)}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm">
                  {freq === 'daily' ? 'Giornaliero' : freq === 'weekly' ? 'Settimanale' : 'Manuale'}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Nota: i prezzi mensili vengono calcolati dall'ultimo close disponibile
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="px-8">
          <Save className="h-4 w-4" />
          Salva Impostazioni
        </Button>
      </div>
    </div>
  );
}
