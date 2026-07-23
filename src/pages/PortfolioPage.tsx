import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioState, useInvalidatePortfolioState } from '@/hooks/usePortfolioState';
import { useOperationModal } from '@/contexts/operationModalStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { RebalancePlanPanel } from '@/components/rebalance/RebalancePlanPanel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MoreHorizontal, TrendingUp, TrendingDown, X, Undo2, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { D, ZERO, type Decimal } from '@/domain/decimal';
import type { LedgerRow, InstrumentRow, PriceRow, FxRow } from '@/domain/types';
import { simulateReversal, opTypeLabel, reversedIds } from '@/domain/reversalSimulation';
import { latestPriceFor } from '@/domain/pnl';
import { registerReversal, newIdempotencyKey } from '@/services/operations';
import { parseDeepLinkParams } from '@/lib/alertRouting';
import { formatEur } from '@/lib/formatEur';

// ============================================================================
// Query strumenti con status (colonna non presente nei tipi generati)
// ============================================================================
interface InstrumentWithStatus extends InstrumentRow {
  status: 'active' | 'archived';
}

function useInstrumentsWithStatus(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['instruments-portfolio-page', userId],
    enabled: !!userId,
    queryFn: async (): Promise<InstrumentWithStatus[]> => {
      const { data: pf } = await supabase
        .from('portfolios').select('id').eq('user_id', userId!).maybeSingle();
      if (!pf) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('instruments_v')
        .select('id,ticker,name,currency,quantity_step,status')
        .eq('portfolio_id', pf.id);
      if (error) throw error;
      return (data ?? []) as InstrumentWithStatus[];
    },
  });
}

// ============================================================================
// Formatters (presentation-only, no math)
// ============================================================================
const fmtEur = formatEur; // helper condiviso (F6-r2.1)
function fmtQty(v: Decimal): string {
  return Number(v.toFixed(6)).toLocaleString('it-IT', { maximumFractionDigits: 6 });
}
function fmtCcy(v: Decimal | null | undefined, ccy: 'EUR'|'USD'|'CHF'): string {
  if (v === null || v === undefined) return '—';
  const sym = ccy === 'USD' ? '$' : ccy === 'CHF' ? '₣' : '€';
  return `${sym}${Number(v.toFixed(4)).toLocaleString('it-IT', { maximumFractionDigits: 4 })}`;
}
function fmtDate(d: string | null): string {
  return d ? d : '—';
}

// ============================================================================
// Badge helpers
// ============================================================================
function OpTypeBadge({ type }: { type: LedgerRow['op_type'] }) {
  const cls =
    type === 'BUY' ? 'border-emerald-500 text-emerald-600' :
    type === 'SELL' ? 'border-rose-500 text-rose-600' :
    type === 'REVERSAL' ? 'border-amber-500 text-amber-600' :
    type === 'OPENING_POSITION' || type === 'OPENING_CASH' ? 'border-blue-500 text-blue-600' :
    type === 'DIVIDEND' || type === 'OTHER_INCOME' ? 'border-teal-500 text-teal-600' :
    type === 'DEPOSIT' ? 'border-cyan-500 text-cyan-600' :
    type === 'WITHDRAW' || type === 'FEE' ? 'border-orange-500 text-orange-600' :
    'border-muted text-muted-foreground';
  return <Badge variant="outline" className={cls}>{opTypeLabel(type)}</Badge>;
}

// ============================================================================
// Pagina
// ============================================================================
export default function PortfolioPage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const invalidate = useInvalidatePortfolioState();
  const { state, data: inputs, isLoading } = usePortfolioState(user?.id ?? null);
  const { data: instrumentsWithStatus } = useInstrumentsWithStatus(user?.id);
  const { open: openOpModal } = useOperationModal();
  const [searchParams, setSearchParams] = useSearchParams();

  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reverseBusy, setReverseBusy] = useState(false);
  const [highlightedInstrumentId, setHighlightedInstrumentId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLTableRowElement>(null);

  // ---- Deep link ---------------------------------------------------------
  useEffect(() => {
    const dl = parseDeepLinkParams(searchParams);
    if (!dl.action && !dl.instrumentId) return;
    if (dl.instrumentId) {
      setHighlightedInstrumentId(dl.instrumentId);
      setTimeout(() => setHighlightedInstrumentId(null), 3000);
    }
    if (dl.action === 'buy' && dl.instrumentId) {
      openOpModal({ kind: 'BUY', instrumentId: dl.instrumentId });
    } else if (dl.action === 'sell' && dl.instrumentId) {
      openOpModal({ kind: 'SELL', instrumentId: dl.instrumentId });
    } else if (dl.action === 'close' && dl.instrumentId) {
      openOpModal({ kind: 'SELL', instrumentId: dl.instrumentId, closePosition: true });
    }
    setSearchParams({});
  }, [searchParams, openOpModal, setSearchParams]);

  // ---- Enriched valuations + cash row -----------------------------------
  const instrumentById = useMemo(() => {
    const m = new Map<string, InstrumentWithStatus>();
    (instrumentsWithStatus ?? []).forEach((i) => m.set(i.id, i));
    return m;
  }, [instrumentsWithStatus]);

  const totalValueEur: Decimal = state?.totals.totalValueEur ?? ZERO;
  const cashEur: Decimal = state?.cash.cashEur ?? ZERO;

  const rows = useMemo(() => {
    if (!state) return [];
    return state.valuations
      .map((v) => {
        const instr = instrumentById.get(v.instrumentId);
        return { v, instr };
      })
      .sort((a, b) => (a.instr?.name ?? '').localeCompare(b.instr?.name ?? ''));
  }, [state, instrumentById]);

  // Correzione E: se ANCHE UNA posizione con quantità > 0 è missing_price/missing_fx,
  // valore totale, pesi e P/L non realizzato dipendenti diventano "n/d" a livello pagina.
  const missingValuations = useMemo(
    () => (state?.valuations ?? []).filter(
      (v) => v.status !== 'valued' && v.quantity.gt(0),
    ),
    [state],
  );
  const hasMissingValuation = missingValuations.length > 0;
  const missingSummary = useMemo(() => {
    if (!hasMissingValuation) return '';
    const names = missingValuations
      .map((v) => instrumentById.get(v.instrumentId)?.ticker ?? v.instrumentId)
      .join(', ');
    return `Dati mancanti su: ${names}`;
  }, [missingValuations, instrumentById, hasMissingValuation]);

  // Peso su totale INCLUSA cassa
  function weightOf(mv: Decimal | null | undefined): string {
    if (hasMissingValuation) return 'n/d';
    if (mv === null || mv === undefined) return '—';
    if (totalValueEur.isZero()) return '0,0%';
    const w = mv.div(totalValueEur).times(100);
    return `${Number(w.toFixed(1)).toLocaleString('it-IT', { minimumFractionDigits: 1 })}%`;
  }
  function cashWeight(): string {
    if (hasMissingValuation) return 'n/d';
    if (totalValueEur.isZero()) return '0,0%';
    const w = cashEur.div(totalValueEur).times(100);
    return `${Number(w.toFixed(1)).toLocaleString('it-IT', { minimumFractionDigits: 1 })}%`;
  }

  // ---- Storno preview ---------------------------------------------------
  const reversePreview = useMemo(() => {
    if (!reverseTargetId || !inputs) return null;
    return simulateReversal(
      inputs.operations,
      reverseTargetId,
      inputs.instruments,
    );
  }, [reverseTargetId, inputs]);

  async function confirmReversal() {
    if (!reverseTargetId) return;
    setReverseBusy(true);
    try {
      await registerReversal(newIdempotencyKey(), reverseTargetId);
      toast.success('Operazione stornata');
      invalidate();
      qc.invalidateQueries();
      setReverseTargetId(null);
    } catch (e) {
      toast.error('Storno fallito', { description: (e as Error).message });
    } finally {
      setReverseBusy(false);
    }
  }

  // ---- Ledger + REVERSAL set --------------------------------------------
  const ledger = useMemo(() => inputs?.operations ?? [], [inputs?.operations]);
  const reversedSet = useMemo(() => reversedIds(ledger), [ledger]);
  const ledgerSorted = useMemo(() => {
    return [...ledger].sort((a, b) => {
      if (a.effective_date !== b.effective_date) return b.effective_date.localeCompare(a.effective_date);
      if (a.recorded_at !== b.recorded_at) return b.recorded_at.localeCompare(a.recorded_at);
      const la = a.seq.length, lb = b.seq.length;
      if (la !== lb) return lb - la;
      return b.seq.localeCompare(a.seq);
    });
  }, [ledger]);

  function canReverse(op: LedgerRow): { ok: boolean; reason?: string } {
    if (op.op_type === 'REVERSAL') return { ok: false, reason: 'È già uno storno' };
    if (reversedSet.has(op.id)) return { ok: false, reason: 'Già stornata' };
    if (op.op_type === 'OPENING_POSITION' || op.op_type === 'OPENING_CASH') {
      const hasOrd = ledger.some((r) =>
        ['BUY','SELL','DEPOSIT','WITHDRAW','DIVIDEND','OTHER_INCOME','FEE'].includes(r.op_type));
      if (hasOrd) return { ok: false, reason: 'Finestra chiusa: sposta la correzione via Wizard amend' };
    }
    return { ok: true };
  }

  // ---- Actions ----------------------------------------------------------
  function openBuy(instrId: string) {
    openOpModal({ kind: 'BUY', instrumentId: instrId });
  }
  function openSell(instrId: string, closePosition = false) {
    const pos = state?.valuations.find((v) => v.instrumentId === instrId);
    const prefillQty = closePosition && pos ? pos.quantity.toString() : undefined;
    const price =
      inputs
        ? latestPriceFor(inputs.prices, instrId)?.price?.toString()
        : undefined;
    openOpModal({
      kind: 'SELL',
      instrumentId: instrId,
      quantity: prefillQty,
      priceCcy: price,
      closePosition,
    });
  }

  // ---- Render -----------------------------------------------------------
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Valore Totale Portafoglio</p>
              {hasMissingValuation ? (
                <p className="text-3xl font-bold text-muted-foreground" title={missingSummary}>n/d</p>
              ) : (
                <p className="text-3xl font-bold">{fmtEur(totalValueEur)}</p>
              )}
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-sm text-muted-foreground">Cassa</p>
              <p className="text-xl font-semibold">{fmtEur(cashEur)}</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-sm text-muted-foreground">P/L realizzato</p>
              <p className={`text-xl font-semibold ${state && state.cash.realizedPnlEur.lt(0) ? 'text-red-600' : 'text-green-600'}`}>
                {fmtEur(state?.cash.realizedPnlEur)}
              </p>
            </div>
          </div>
          <Button onClick={() => openOpModal()}>Nuova operazione</Button>
        </CardContent>
      </Card>

      {hasMissingValuation && (
        <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Valore totale e pesi non calcolabili</p>
            <p className="text-xs opacity-80">{missingSummary}. Inserisci i prezzi/FX mancanti per ripristinare le valorizzazioni.</p>
          </div>
        </div>
      )}

      <Tabs defaultValue={searchParams.get('tab') === 'rebalance' ? 'rebalance' : 'positions'} className="space-y-4">
        <TabsList>
          <TabsTrigger value="positions">Posizioni</TabsTrigger>
          <TabsTrigger value="operations">Vista Operazioni</TabsTrigger>
          <TabsTrigger value="rebalance">Piano di ribilanciamento</TabsTrigger>
        </TabsList>

        {/* ===================== POSIZIONI ===================== */}
        <TabsContent value="positions">
          <Card>
            <CardHeader><CardTitle>Posizioni</CardTitle></CardHeader>
            <CardContent>
              {isLoading && <p className="text-muted-foreground text-sm">Caricamento…</p>}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strumento</TableHead>
                      <TableHead className="text-right">Quantità</TableHead>
                      <TableHead className="text-right">Valore (EUR)</TableHead>
                      <TableHead className="text-right">Peso</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                      {/* HOTFIX F5: colonna Target rimossa — il target autoritativo
                          vive nel tab "Piano di ribilanciamento" */}
                      <TableHead className="text-center">Stato</TableHead>
                      <TableHead className="text-center">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ v, instr }) => {
                      const isMissing = v.status !== 'valued';
                      const missingLabel =
                        v.status === 'missing_price' ? 'n/d — prezzo mancante' :
                        v.status === 'missing_fx' ? `n/d — FX ${v.currency} mancante` : '';
                      const highlighted = highlightedInstrumentId === v.instrumentId;
                      const cr = canReverse; // silence noUnused
                      void cr;
                      return (
                        <TableRow
                          key={v.instrumentId}
                          ref={highlighted ? highlightedRef : null}
                          className={highlighted ? 'ring-2 ring-primary animate-pulse' : ''}
                        >
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {instr?.name ?? v.instrumentId}
                                {instr?.status === 'archived' && (
                                  <Badge variant="outline" className="ml-2 border-muted text-muted-foreground">Archiviato</Badge>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {instr?.ticker} • {v.currency}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmtQty(v.quantity)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {isMissing ? <span className="text-muted-foreground text-xs">{missingLabel}</span> : fmtEur(v.marketValueEur)}
                          </TableCell>
                          <TableCell className="text-right font-mono">{weightOf(v.marketValueEur)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {/* F6-r2.1: NESSUN aggregato calcolato qui — due valori DAL DOMINIO */}
                            <div className={v.realizedPnlEur.lt(0) ? 'text-red-600' : v.realizedPnlEur.gt(0) ? 'text-green-600' : ''}>
                              Realizzato: {fmtEur(v.realizedPnlEur)}
                            </div>
                            <div className={v.unrealizedPnlEur?.lt(0) ? 'text-red-600' : v.unrealizedPnlEur?.gt(0) ? 'text-green-600' : 'text-muted-foreground'}>
                              Non real.: {isMissing ? 'n/d' : fmtEur(v.unrealizedPnlEur)}
                            </div>
                            <Button variant="ghost" size="sm" className="ml-1 h-6 px-1 text-xs" aria-label={`Dettaglio ${instr?.ticker ?? ''}`}
                              onClick={() => setDetailId(v.instrumentId)}>ⓘ</Button>
                          </TableCell>
                          <TableCell className="text-center">
                            {isMissing ? (
                              <Badge variant="outline" className="border-orange-500 text-orange-600 gap-1">
                                <AlertTriangle className="h-3 w-3" /> {v.status === 'missing_price' ? 'Prezzo' : 'FX'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-500 text-emerald-600">OK</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" aria-label="Azioni posizione"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover border">
                                <DropdownMenuItem
                                  disabled={instr?.status === 'archived'}
                                  onClick={() => openBuy(v.instrumentId)}
                                >
                                  <TrendingUp className="h-4 w-4 mr-2 text-green-600" />Aumenta (BUY)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openSell(v.instrumentId, false)}>
                                  <TrendingDown className="h-4 w-4 mr-2 text-red-600" />Diminuisci (SELL)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isMissing}
                                  onClick={() => openSell(v.instrumentId, true)}
                                  title={isMissing ? missingLabel : undefined}
                                >
                                  <X className="h-4 w-4 mr-2" />Chiudi posizione
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Cash row: sempre visibile */}
                    <TableRow className="bg-muted/40">
                      <TableCell><span className="font-medium">Cassa</span><span className="text-xs text-muted-foreground ml-2">EUR</span></TableCell>
                      <TableCell className="text-right font-mono">—</TableCell>
                      <TableCell className="text-right font-mono font-medium">{fmtEur(cashEur)}</TableCell>
                      <TableCell className="text-right font-mono">{cashWeight()}</TableCell>
                      <TableCell className="text-right font-mono">—</TableCell>
                      <TableCell className="text-center"><Badge variant="outline">Cash</Badge></TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label="Azioni cassa"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border">
                            <DropdownMenuItem onClick={() => openOpModal({ kind: 'DEPOSIT' })}>Versamento</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openOpModal({ kind: 'WITHDRAW' })}>Prelievo</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {rows.length === 0 && !isLoading && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nessuna posizione. Registra una nuova operazione per iniziare.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== VISTA OPERAZIONI ===================== */}
        <TabsContent value="operations">
          <Card>
            <CardHeader><CardTitle>Vista Operazioni</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Strumento</TableHead>
                      <TableHead className="text-right">Quantità</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">Importo (EUR)</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-center">Stato</TableHead>
                      <TableHead className="text-center">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerSorted.map((op) => {
                      const isReversed = reversedSet.has(op.id);
                      const isReversal = op.op_type === 'REVERSAL';
                      const cr = canReverse(op);
                      const instr = op.instrument_id ? instrumentById.get(op.instrument_id) : null;
                      return (
                        <TableRow
                          key={op.id}
                          className={isReversed || isReversal ? 'opacity-70' : ''}
                        >
                          <TableCell className="font-mono text-xs">{op.effective_date}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <OpTypeBadge type={op.op_type} />
                              {isReversed && <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px]">STORNATA</Badge>}
                              {isReversal && op.reversal_of_operation_id && (
                                <span className="text-[10px] text-muted-foreground">di {op.reversal_of_operation_id.slice(0, 8)}…</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {instr ? (
                              <div className="flex flex-col">
                                <span>{instr.ticker}</span>
                                <span className="text-muted-foreground">{instr.name}</span>
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {op.quantity ? fmtQty(D(op.quantity)) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {op.price_ccy && op.currency ? fmtCcy(D(op.price_ccy), op.currency) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {op.gross_amount_eur ? fmtEur(D(op.gross_amount_eur)) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {op.fees_eur !== '0' ? fmtEur(D(op.fees_eur)) : '—'}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {isReversed ? <span className="text-amber-600">annullata</span> : isReversal ? <span className="text-amber-600">storno</span> : <span className="text-emerald-600">attiva</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost" size="sm"
                              disabled={!cr.ok}
                              title={cr.ok ? 'Storna operazione' : cr.reason}
                              onClick={() => setReverseTargetId(op.id)}
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {ledgerSorted.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nessuna operazione nel ledger.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== PIANO DI RIBILANCIAMENTO (F5) ===================== */}
        <TabsContent value="rebalance">
          <RebalancePlanPanel />
        </TabsContent>
      </Tabs>

      {/* ===================== DETTAGLIO POSIZIONE (F6-r2) ===================== */}
      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" className="w-96">
          {(() => {
            const v = state?.valuations.find((x) => x.instrumentId === detailId);
            const instr = detailId ? instrumentById.get(detailId) : undefined;
            if (!v) return null;
            return (
              <div className="space-y-3 pt-6">
                <SheetHeader>
                  <SheetTitle>{instr?.name ?? v.instrumentId}</SheetTitle>
                  <SheetDescription>{instr?.ticker} • {v.currency}</SheetDescription>
                </SheetHeader>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Quantità</span><span className="text-right font-mono">{fmtQty(v.quantity)}</span>
                  <span className="text-muted-foreground">Costo medio (EUR)</span><span className="text-right font-mono">{fmtEur(v.averageCostEur)}</span>
                  <span className="text-muted-foreground">Costo totale</span><span className="text-right font-mono">{fmtEur(v.totalCostEur)}</span>
                  <span className="text-muted-foreground">Prezzo attuale</span><span className="text-right font-mono">{fmtCcy(v.lastPriceNative, v.currency)}</span>
                  <span className="text-muted-foreground">Data prezzo</span><span className="text-right font-mono">{fmtDate(v.lastPriceDate)}</span>
                  <span className="text-muted-foreground">Valore (EUR)</span><span className="text-right font-mono">{fmtEur(v.marketValueEur)}</span>
                  <span className="text-muted-foreground">P/L non realizzato</span><span className="text-right font-mono">{fmtEur(v.unrealizedPnlEur)}</span>
                  <span className="text-muted-foreground">P/L realizzato</span><span className="text-right font-mono">{fmtEur(v.realizedPnlEur)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Target e delta: nel tab "Piano di ribilanciamento".</p>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ===================== DIALOG STORNO ===================== */}
      <Dialog open={!!reverseTargetId} onOpenChange={(v) => !v && setReverseTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Storna operazione</DialogTitle>
            <DialogDescription>
              Lo storno crea una REVERSAL: l'operazione originale non viene cancellata,
              ma neutralizzata nel replay canonico.
            </DialogDescription>
          </DialogHeader>

          {reversePreview !== null && reversePreview.ok === false ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{reversePreview.message}</AlertDescription>
            </Alert>
          ) : null}

          {reversePreview !== null && reversePreview.ok === true && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground mb-1">Cassa (EUR)</p>
                <div className="flex items-center justify-between font-mono">
                  <span>{fmtEur(reversePreview.cash.before)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={reversePreview.cash.after.lt(reversePreview.cash.before) ? 'text-red-600' : 'text-green-600'}>
                    {fmtEur(reversePreview.cash.after)}
                  </span>
                </div>
              </div>
              {reversePreview.positions.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Posizioni impattate</p>
                  <table className="w-full text-xs font-mono">
                    <tbody>
                      {reversePreview.positions.map((p) => (
                        <tr key={p.instrumentId}>
                          <td className="py-1">{p.ticker ?? p.instrumentId.slice(0, 8)}</td>
                          <td className="text-right py-1">{fmtQty(p.before)}</td>
                          <td className="text-center text-muted-foreground">→</td>
                          <td className="text-right py-1">{fmtQty(p.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                Il server esegue una nuova validazione punto-a-punto: se il replay
                risultasse incoerente, la richiesta verrà respinta.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReverseTargetId(null)} disabled={reverseBusy}>Annulla</Button>
            <Button
              onClick={confirmReversal}
              disabled={reverseBusy || !reversePreview?.ok}
            >
              {reverseBusy ? 'Storno…' : 'Conferma storno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}