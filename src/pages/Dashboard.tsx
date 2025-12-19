import { RefreshCw, Calendar } from 'lucide-react';
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
  mockStrategyState, 
  mockPositions, 
  mockAlerts, 
  mockTradeSuggestions,
  mockTargetsRiskOn,
  mockTargetsRiskOff,
  mockInstruments
} from '@/lib/mockData';
import { Transaction } from '@/types/portfolio';
import { useState } from 'react';
import { toast } from 'sonner';

export default function Dashboard() {
  const [positions, setPositions] = useState(mockPositions);
  const currentMonth = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const targets = mockStrategyState.regime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;
  const safeRegime: 'RISK_ON' | 'RISK_OFF' = mockStrategyState.regime === 'UNDETERMINED' ? 'RISK_ON' : mockStrategyState.regime;

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

      {/* Top row - Key metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RegimeCard 
          regime={mockStrategyState.regime}
          ratio={mockStrategyState.msciGoldRatio}
          sma10={mockStrategyState.sma10Ratio}
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
        <TradesList trades={mockTradeSuggestions} />
      </div>

      {/* Holdings Table */}
      <HoldingsTable positions={positions} targets={targets} />
    </div>
  );
}
