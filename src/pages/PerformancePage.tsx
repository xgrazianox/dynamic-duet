import { TrendingUp, TrendingDown, Trophy, Target, Percent, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mockClosedPositions, calculatePLSummary, mockTransactions, mockInstruments } from '@/lib/mockData';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionsHistory } from '@/components/transactions/TransactionsHistory';
import { SLEEVES, Transaction } from '@/types/portfolio';
import { useState } from 'react';

export default function PerformancePage() {
  const [transactions, setTransactions] = useState(mockTransactions);
  const [closedPositions] = useState(mockClosedPositions);
  
  const summary = calculatePLSummary(closedPositions);

  const handleNewTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTransaction: Transaction = {
      ...tx,
      id: `t${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setTransactions(prev => [...prev, newTransaction]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rendimenti & P/L</h1>
          <p className="text-muted-foreground">Analisi delle performance e storico operazioni</p>
        </div>
        <div className="flex gap-3">
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
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={summary.totalPL >= 0 ? 'border-risk-on/30' : 'border-risk-off/30'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {summary.totalPL >= 0 ? <TrendingUp className="h-4 w-4 text-risk-on" /> : <TrendingDown className="h-4 w-4 text-risk-off" />}
              P/L Totale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${summary.totalPL >= 0 ? 'text-risk-on' : 'text-risk-off'}`}>
              {summary.totalPL >= 0 ? '+' : ''}€{summary.totalPL.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </div>
            <p className={`text-sm ${summary.totalPLPercent >= 0 ? 'text-risk-on' : 'text-risk-off'}`}>
              {summary.totalPLPercent >= 0 ? '+' : ''}{summary.totalPLPercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {summary.winRate.toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.winningTrades}W / {summary.losingTrades}L
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-risk-on" />
              Media Utile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-risk-on">
              +€{summary.avgWin.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">
              per trade vincente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Percent className="h-4 w-4 text-risk-off" />
              Media Perdita
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-risk-off">
              €{summary.avgLoss.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">
              per trade perdente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Closed Positions Table */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Posizioni Chiuse
            <Badge variant="outline">{closedPositions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sleeve</TableHead>
                <TableHead>Data Acquisto</TableHead>
                <TableHead>Data Vendita</TableHead>
                <TableHead className="text-right">Prezzo Acquisto</TableHead>
                <TableHead className="text-right">Prezzo Vendita</TableHead>
                <TableHead className="text-right">Quantità</TableHead>
                <TableHead className="text-right">P/L €</TableHead>
                <TableHead className="text-right">P/L %</TableHead>
                <TableHead className="text-right">Giorni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closedPositions.map((cp) => (
                <TableRow key={cp.id}>
                  <TableCell className="font-medium">
                    {SLEEVES[cp.sleeveKey]?.name || cp.sleeveKey}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {new Date(cp.buyDate).toLocaleDateString('it-IT')}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {new Date(cp.sellDate).toLocaleDateString('it-IT')}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    €{cp.buyPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    €{cp.sellPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {cp.quantity.toLocaleString('it-IT')}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    <span className={cp.profitLossEur >= 0 ? 'text-risk-on' : 'text-risk-off'}>
                      {cp.profitLossEur >= 0 ? '+' : ''}€{cp.profitLossEur.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge 
                      variant={cp.profitLossPercent >= 0 ? 'default' : 'secondary'}
                      className={cp.profitLossPercent >= 0 ? 'bg-risk-on/20 text-risk-on' : 'bg-risk-off/20 text-risk-off'}
                    >
                      {cp.profitLossPercent >= 0 ? '+' : ''}{cp.profitLossPercent.toFixed(2)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {cp.holdingDays}g
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {closedPositions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nessuna posizione chiusa
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions History */}
      <TransactionsHistory transactions={transactions} />
    </div>
  );
}