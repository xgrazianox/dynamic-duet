import { RefreshCw, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RegimeCard } from '@/components/dashboard/RegimeCard';
import { PortfolioSummary } from '@/components/dashboard/PortfolioSummary';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { TradesList } from '@/components/dashboard/TradesList';
import { RatioChart } from '@/components/dashboard/RatioChart';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationComparisonChart } from '@/components/dashboard/AllocationComparisonChart';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { 
  mockPositions, 
  mockAlerts, 
  calculateTradeSuggestions,
  mockTargetsRiskOn,
  mockTargetsRiskOff,
  mockInstruments
} from '@/lib/mockData';
import { Transaction } from '@/types/portfolio';
import { useMemo, useState } from 'react';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { toast } from 'sonner';

export default function Dashboard() {
  const [positions, setPositions] = useState(mockPositions);
  const { engineResult, finalRegime, config } = useSignalEngine();
  const currentMonth = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const safeRegime: 'RISK_ON' | 'RISK_OFF' =
    finalRegime === 'UNDETERMINED' ? 'RISK_ON' : finalRegime;
  const targets = safeRegime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;

  const tradeSuggestions = useMemo(
    () => calculateTradeSuggestions(positions, targets, safeRegime),
    [positions, targets, safeRegime]
  );

  const handleNewTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    // Update positions based on transaction
    setPositions(prev => {
      const existingIdx = prev.findIndex(p => p.sleeveKey === tx.sleeveKey);
      if (existingIdx >= 0) {
        const updated = [...prev];
        if (tx.type === 'BUY') {
          updated[existingIdx] = {
            ...updated[existingIdx],
            marketValueEur: updated[existingIdx].marketValueEur + tx.totalValueEur
          };
        } else {
          updated[existingIdx] = {
            ...updated[existingIdx],
            marketValueEur: Math.max(0, updated[existingIdx].marketValueEur - tx.totalValueEur)
          };
        }
        return updated;
      }
      return prev;
    });
    toast.success(`${tx.type === 'BUY' ? 'Acquisto' : 'Vendita'} registrato - Portafoglio aggiornato`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4" />
            {currentMonth}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TransactionForm 
            instruments={mockInstruments} 
            onSubmit={handleNewTransaction}
            defaultType="BUY"
          />
          <TransactionForm 
            instruments={mockInstruments} 
            onSubmit={handleNewTransaction}
            defaultType="SELL"
          />
          <Button variant="outline">
            <RefreshCw className="h-4 w-4" />
            Aggiorna Quotazioni
          </Button>
          <Button>
            Ricalcola
          </Button>
        </div>
      </div>

      {/* Sync banner — regime derives from Signal Engine (modalità: {config.decision.mode}) */}
      {engineResult.decision.hasConflict && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" />
          <span>
            Sistema A ({engineResult.signalA.currentRegime}) e Sistema B ({engineResult.signalB.currentRegime}) discordano.
            Regime finale applicato: <strong>{finalRegime}</strong> (modalità {config.decision.mode}).
          </span>
        </div>
      )}

      {/* Top row - Key metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RegimeCard 
          regime={finalRegime}
          ratio={engineResult.signalA.ratio}
          sma10={engineResult.signalA.sma}
        />
        <PortfolioSummary positions={positions} />
        <AlertsPanel alerts={mockAlerts} />
      </div>

      {/* Allocation Comparison Chart */}
      <AllocationComparisonChart 
        positions={positions}
        targetsRiskOn={mockTargetsRiskOn}
        targetsRiskOff={mockTargetsRiskOff}
        currentRegime={safeRegime}
      />

      {/* Chart and Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RatioChart />
        <TradesList trades={tradeSuggestions} />
      </div>

      {/* Holdings Table */}
      <HoldingsTable positions={positions} targets={targets} />
    </div>
  );
}
