import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioState } from '@/hooks/usePortfolioState';
import { useOperationModal } from '@/contexts/operationModalStore';
import { opTypeLabel } from '@/domain/reversalSimulation';
import type { LedgerRow } from '@/domain/types';

// Blocco D (F2): lettura TEMPORANEA del ledger grezzo. Nessuna metrica calcolata
// localmente: gross_amount_eur e fees_eur sono valori PERSISTITI dal server.
// Le metriche complete (P/L, Dietz, win-rate…) arrivano in F4.
function fmtEur(s: string | null): string {
  if (s === null) return '—';
  return `€${Number(s).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PerformancePage() {
  const { user } = useCurrentUser();
  const { data: inputs, isLoading } = usePortfolioState(user?.id ?? null);
  const { open: openOpModal } = useOperationModal();

  const ledger: LedgerRow[] = [...(inputs?.operations ?? [])].sort((a, b) => {
    if (a.effective_date !== b.effective_date) return a.effective_date < b.effective_date ? 1 : -1;
    if (a.recorded_at !== b.recorded_at) return a.recorded_at < b.recorded_at ? 1 : -1;
    return Number(b.seq) - Number(a.seq);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rendimenti &amp; P/L</h1>
          <p className="text-muted-foreground">Storico operazioni dal registro contabile</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => openOpModal({ kind: 'BUY' })}>Nuova operazione</Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Metriche complete di rendimento (P/L totale, Modified Dietz, win-rate, curva del valore)
          <strong> disponibili in F4</strong>. Qui è mostrato il registro operazioni grezzo.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Registro operazioni
            <Badge variant="outline">{ledger.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 animate-pulse rounded bg-muted/40" />
          ) : ledger.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nessuna operazione registrata.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantità</TableHead>
                    <TableHead className="text-right">Controvalore €</TableHead>
                    <TableHead className="text-right">Commissioni €</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((op) => (
                    <TableRow key={op.id} className={op.reversal_of_operation_id ? 'opacity-70' : ''}>
                      <TableCell className="font-mono text-sm">{op.effective_date}</TableCell>
                      <TableCell><Badge variant="outline">{opTypeLabel(op.op_type)}</Badge></TableCell>
                      <TableCell className="text-right font-mono">
                        {op.quantity ? Number(op.quantity).toLocaleString('it-IT', { maximumFractionDigits: 6 }) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtEur(op.gross_amount_eur)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtEur(op.fees_eur)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
