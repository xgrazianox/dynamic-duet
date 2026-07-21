import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { Transaction } from '@/types/portfolio';

interface EnrichedPosition {
  position: {
    id: string;
    quantity?: number;
    marketValueEur: number;
    averageBuyPrice?: number;
  };
  instrument: {
    id: string;
    name: string;
    ticker: string;
    currency: 'EUR' | 'USD' | 'CHF';
  };
  sleeveName: string;
  currentWeight: number;
  targetWeight: number;
  delta: number;
  suggestedTradeEur: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  lastPrice: number;
  costBasis: number;
}

interface PositionDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: EnrichedPosition | null;
  transactions: Transaction[];
}

export function PositionDetailDrawer({ open, onOpenChange, position, transactions }: PositionDetailDrawerProps) {
  if (!position) return null;

  const plColor = position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600';
  // Convention: delta = current − target. Positive = sovrappeso (rosso), negative = sottopeso (verde/azione BUY).
  const deltaColor = position.delta > 0 ? 'text-red-600' : 'text-green-600';
  const currencySymbol = position.instrument.currency === 'USD' ? '$' : position.instrument.currency === 'CHF' ? '₣' : '€';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{position.instrument.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {position.instrument.ticker} • {position.sleeveName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Valore attuale</p>
              <p className="text-xl font-mono font-bold">
                €{position.position.marketValueEur.toLocaleString('it-IT')}
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">P/L non realizzato</p>
              <p className={`text-xl font-mono font-bold ${plColor}`}>
                {position.unrealizedPL >= 0 ? '+' : ''}€{position.unrealizedPL.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                <span className="text-sm ml-1">
                  ({position.unrealizedPLPercent >= 0 ? '+' : ''}{position.unrealizedPLPercent.toFixed(1)}%)
                </span>
              </p>
            </div>
          </div>

          {/* Position details */}
          <div className="space-y-2">
            <h4 className="font-medium">Dettagli posizione</h4>
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Quantità</p>
                <p className="font-mono">{position.position.quantity?.toLocaleString('it-IT') || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Prezzo medio acq.</p>
                <p className="font-mono">{currencySymbol}{position.position.averageBuyPrice?.toFixed(2) || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Prezzo attuale</p>
                <p className="font-mono">{currencySymbol}{position.lastPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Costo totale</p>
                <p className="font-mono">€{position.costBasis.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>

          {/* Strategy alignment */}
          <div className="space-y-2">
            <h4 className="font-medium">Allineamento strategia</h4>
            <div className="grid grid-cols-3 gap-4 p-4 border rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Peso attuale</p>
                <p className="font-mono">{(position.currentWeight * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Peso target</p>
                <p className="font-mono">{(position.targetWeight * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delta</p>
                <p className={`font-mono ${deltaColor}`}>
                  {position.delta >= 0 ? '+' : ''}{(position.delta * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            
            {Math.abs(position.suggestedTradeEur) > 50 && (
              <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Trade suggerito</p>
                    <p className={`text-lg font-mono font-bold ${position.suggestedTradeEur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.suggestedTradeEur >= 0 ? '+' : ''}€{position.suggestedTradeEur.toLocaleString('it-IT')}
                    </p>
                  </div>
                  <Badge variant={position.delta < 0 ? 'default' : 'secondary'}>
                    {position.delta < 0 ? 'Sottopeso' : 'Sovrappeso'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {position.delta < 0
                    ? 'La posizione è sottopesata rispetto al target. Considera di aumentare.'
                    : 'La posizione è sovrappesata rispetto al target. Considera di ridurre.'}
                </p>
              </div>
            )}
          </div>

          {/* Transaction history */}
          <div className="space-y-2">
            <h4 className="font-medium">Storico transazioni</h4>
            {transactions.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-sm">
                            {new Date(tx.date).toLocaleDateString('it-IT')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={tx.type === 'BUY' ? 'default' : tx.type === 'SELL' ? 'destructive' : 'secondary'}>
                              {tx.type === 'BUY' && <TrendingUp className="h-3 w-3 mr-1" />}
                              {tx.type === 'SELL' && <TrendingDown className="h-3 w-3 mr-1" />}
                              {tx.type === 'CLOSE' && <X className="h-3 w-3 mr-1" />}
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {tx.quantity.toLocaleString('it-IT')}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            €{tx.pricePerUnit.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            €{tx.totalValueEur.toLocaleString('it-IT')}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 border rounded-lg">
                Nessuna transazione registrata
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}