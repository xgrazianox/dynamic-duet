import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
import { Transaction, SLEEVES } from '@/types/portfolio';

interface TransactionsHistoryProps {
  transactions: Transaction[];
}

export function TransactionsHistory({ transactions }: TransactionsHistoryProps) {
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Storico Transazioni
          <Badge variant="outline">{transactions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Sleeve</TableHead>
              <TableHead className="text-right">Quantità</TableHead>
              <TableHead className="text-right">Prezzo</TableHead>
              <TableHead className="text-right">Totale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTransactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-mono text-sm">
                  {new Date(tx.date).toLocaleDateString('it-IT')}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={tx.type === 'BUY' ? 'default' : 'secondary'}
                    className={tx.type === 'BUY' ? 'bg-risk-on/20 text-risk-on' : 'bg-risk-off/20 text-risk-off'}
                  >
                    {tx.type === 'BUY' ? (
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 mr-1" />
                    )}
                    {tx.type === 'BUY' ? 'Acquisto' : 'Vendita'}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {SLEEVES[tx.sleeveKey]?.name || tx.sleeveKey}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {tx.quantity.toLocaleString('it-IT', { maximumFractionDigits: 4 })}
                </TableCell>
                <TableCell className="text-right font-mono">
                  €{tx.pricePerUnit.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  <span className={tx.type === 'BUY' ? 'text-risk-on' : 'text-risk-off'}>
                    {tx.type === 'BUY' ? '+' : '-'}€{tx.totalValueEur.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {transactions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nessuna transazione registrata
          </div>
        )}
      </CardContent>
    </Card>
  );
}