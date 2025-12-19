import { RefreshCw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RegimeCard } from '@/components/dashboard/RegimeCard';
import { PortfolioSummary } from '@/components/dashboard/PortfolioSummary';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { TradesList } from '@/components/dashboard/TradesList';
import { RatioChart } from '@/components/dashboard/RatioChart';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { 
  mockStrategyState, 
  mockPositions, 
  mockAlerts, 
  mockTradeSuggestions,
  mockTargetsRiskOn,
  mockTargetsRiskOff 
} from '@/lib/mockData';

export default function Dashboard() {
  const currentMonth = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const targets = mockStrategyState.regime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;

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
        <PortfolioSummary positions={mockPositions} />
        <AlertsPanel alerts={mockAlerts} />
      </div>

      {/* Chart and Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RatioChart />
        <TradesList trades={mockTradeSuggestions} />
      </div>

      {/* Holdings Table */}
      <HoldingsTable positions={mockPositions} targets={targets} />
    </div>
  );
}
