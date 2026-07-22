import { RefreshCw, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RegimeCard } from '@/components/dashboard/RegimeCard';
import { PortfolioSummary } from '@/components/dashboard/PortfolioSummary';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { TradesList } from '@/components/dashboard/TradesList';
import { RatioChart } from '@/components/dashboard/RatioChart';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationComparisonChart } from '@/components/dashboard/AllocationComparisonChart';
import { useOperationModal } from '@/contexts/OperationModalContext';
import {
  calculateTradeSuggestions,
  mockTargetsRiskOn,
  mockTargetsRiskOff,
} from '@/lib/mockData';
import { PortfolioPosition, Transaction } from '@/types/portfolio';
import { useMemo, useState } from 'react';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { useAppState } from '@/contexts/AppStateContext';
import { useAllAlerts } from '@/hooks/useAllAlerts';
import { toast } from 'sonner';

export default function Dashboard() {
  const { positions, setPositions, setTransactions, instruments } = useAppState();
  const { open: openOpModal } = useOperationModal();
  const alerts = useAllAlerts();
  const { engineResult, finalRegime, config } = useSignalEngine();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const currentMonth = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const safeRegime: 'RISK_ON' | 'RISK_OFF' =
    finalRegime === 'UNDETERMINED' ? 'RISK_ON' : finalRegime;
  const targets = safeRegime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;

  const tradeSuggestions = useMemo(
    () => calculateTradeSuggestions(positions, targets, safeRegime),
    [positions, targets, safeRegime]
  );

  const handleNewTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTx: Transaction = {
      ...tx,
      id: `t${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setTransactions(prev => [...prev, newTx]);

    setPositions(prev => {
      const idx = prev.findIndex(p => p.sleeveKey === tx.sleeveKey && p.instrumentId === tx.instrumentId);
      if (idx < 0) {
        if (tx.type !== 'BUY') return prev;
        const newPos: PortfolioPosition = {
          id: `p${Date.now()}`,
          instrumentId: tx.instrumentId,
          sleeveKey: tx.sleeveKey,
          asOfDate: tx.date,
          quantity: tx.quantity,
          marketValueEur: tx.totalValueEur,
          averageBuyPrice: tx.pricePerUnit,
          isClosed: false,
        };
        return [...prev, newPos];
      }
      const updated = [...prev];
      const p = updated[idx];
      if (tx.type === 'BUY') {
        const oldQty = p.quantity || 0;
        const oldCost = (p.averageBuyPrice || 0) * oldQty;
        const newQty = oldQty + tx.quantity;
        updated[idx] = {
          ...p,
          quantity: newQty,
          marketValueEur: p.marketValueEur + tx.totalValueEur,
          averageBuyPrice: newQty > 0 ? (oldCost + tx.totalValueEur) / newQty : p.averageBuyPrice,
          isClosed: false,
        };
      } else {
        const newQty = Math.max(0, (p.quantity || 0) - tx.quantity);
        const newVal = Math.max(0, p.marketValueEur - tx.totalValueEur);
        updated[idx] = {
          ...p,
          quantity: newQty,
          marketValueEur: newVal,
          isClosed: newQty <= 0 || newVal <= 0,
        };
      }
      return updated;
    });

    const existed = positions.some(p => p.sleeveKey === tx.sleeveKey && p.instrumentId === tx.instrumentId);
    if (tx.type !== 'BUY' && !existed) {
      toast.error('Nessuna posizione esistente da vendere per questo strumento');
      return;
    }
    toast.success(`${tx.type === 'BUY' ? 'Acquisto' : 'Vendita'} registrato - Portafoglio aggiornato`);
  };

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1500));
    setIsRefreshing(false);
    toast.success('Quotazioni aggiornate');
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    await new Promise(r => setTimeout(r, 600));
    setIsRecalculating(false);
    toast.success(`Trade suggeriti ricalcolati (${tradeSuggestions.length} operazioni)`);
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
          <Button variant="success" onClick={() => openOpModal({ kind: 'BUY' })}>
            Nuovo acquisto
          </Button>
          <Button variant="warning" onClick={() => openOpModal({ kind: 'SELL' })}>
            Nuova vendita
          </Button>
          <Button variant="outline" onClick={handleRefreshPrices} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Aggiorna Quotazioni
          </Button>
          <Button onClick={handleRecalculate} disabled={isRecalculating}>
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
          smaMonths={config.signalA.smaMonths}
          reason={engineResult.decision.reason}
        />
        <PortfolioSummary positions={positions} />
        <AlertsPanel alerts={alerts} />
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
