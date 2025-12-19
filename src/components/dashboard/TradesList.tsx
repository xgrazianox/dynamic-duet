import { ArrowUpCircle, ArrowDownCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TradeSuggestion, SLEEVES } from '@/types/portfolio';

interface TradesListProps {
  trades: TradeSuggestion[];
}

export function TradesList({ trades }: TradesListProps) {
  const topTrades = trades.slice(0, 5);

  const exportCSV = () => {
    const headers = ['Sleeve', 'Peso Corrente', 'Peso Target', 'Delta', 'Trade EUR', 'Note'];
    const rows = trades.map(t => [
      SLEEVES[t.sleeveKey]?.name || t.sleeveKey,
      `${(t.currentWeight * 100).toFixed(2)}%`,
      `${(t.targetWeight * 100).toFixed(2)}%`,
      `${(t.deltaWeight * 100).toFixed(2)}%`,
      `€${t.suggestedTradeEur.toLocaleString('it-IT')}`,
      t.rationale
    ]);
    
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-suggestions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="rounded-xl border border-border bg-card card-glow">
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div>
          <h3 className="font-semibold">Azioni Consigliate</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Trade suggeriti per ribilanciamento
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4" />
          Esporta CSV
        </Button>
      </div>

      {topTrades.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <p>Nessun trade suggerito. Portafoglio allineato al target.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {topTrades.map(trade => {
            const isBuy = trade.suggestedTradeEur > 0;
            const sleeve = SLEEVES[trade.sleeveKey];
            
            return (
              <div key={trade.id} className="flex items-center gap-4 p-4 hover:bg-accent/30 transition-colors">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isBuy ? 'bg-risk-on/10' : 'bg-destructive/10'
                }`}>
                  {isBuy ? (
                    <ArrowUpCircle className="h-5 w-5 text-risk-on" />
                  ) : (
                    <ArrowDownCircle className="h-5 w-5 text-destructive" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{sleeve?.name || trade.sleeveKey}</p>
                  <p className="text-xs text-muted-foreground">
                    {(trade.currentWeight * 100).toFixed(1)}% → {(trade.targetWeight * 100).toFixed(1)}%
                  </p>
                </div>

                <div className="text-right">
                  <p className={`font-mono font-semibold ${isBuy ? 'positive' : 'negative'}`}>
                    {isBuy ? '+' : ''}€{trade.suggestedTradeEur.toLocaleString('it-IT')}
                  </p>
                  <p className="text-xs text-muted-foreground">{isBuy ? 'Compra' : 'Vendi'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {trades.length > 5 && (
        <div className="p-4 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            +{trades.length - 5} altri trade suggeriti
          </p>
        </div>
      )}
    </div>
  );
}
