import { useMemo, useState } from 'react';
import { Scale, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioState } from '@/hooks/usePortfolioState';
import { usePortfolioMeta, useInstruments, useTargets, useRegimeDecisions } from '@/hooks/usePortfolioMeta';
import { useOperationModal } from '@/contexts/operationModalStore';
import { D, Decimal } from '@/domain/decimal';
import { computeRegimeState } from '@/domain/regimeState';
import { computeRebalancePlan, type RebalancePlan, type PlanRow } from '@/domain/rebalance';
import { markRegimeApplied } from '@/services/regime';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const eur = (v: Decimal | null | undefined) => v == null ? 'n/d'
  : `€${Number(v.toFixed(2)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (v: Decimal | null | undefined) => v == null ? '—' : `${Number(v.toFixed(2)).toLocaleString('it-IT')}%`;
const regimeLbl = (r: 'RISK_ON' | 'RISK_OFF' | null) => r === 'RISK_ON' ? 'RISK-ON' : r === 'RISK_OFF' ? 'RISK-OFF' : '—';

export function RebalancePlanPanel() {
  const { user } = useCurrentUser();
  const { data: inputs, state } = usePortfolioState(user?.id ?? null);
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const settings = meta.data?.settings ?? null;
  const instQ = useInstruments(portfolioId);
  const tgtQ = useTargets(portfolioId);
  const decQ = useRegimeDecisions(portfolioId);
  const { open: openOpModal } = useOperationModal();
  const qc = useQueryClient();
  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const asOf = todayIso();

  const regimeState = useMemo(
    () => computeRegimeState(decQ.data ?? [], settings?.last_applied_regime ?? null),
    [decQ.data, settings?.last_applied_regime],
  );

  const targetRows = useMemo(() => {
    if (!regimeState.applicableRegime || !tgtQ.data) return null;
    const active = tgtQ.data.sets.find(s => s.regime === regimeState.applicableRegime && s.status === 'active');
    if (!active) return null;
    return tgtQ.data.allocs
      .filter(a => a.target_set_id === active.id)
      .map(a => ({ instrumentId: a.instrument_id, weightPct: D(a.weight) }));
  }, [regimeState.applicableRegime, tgtQ.data]);

  const plan: RebalancePlan | null = useMemo(() => {
    if (!state || !inputs || !settings || !instQ.data) return null;
    return computeRebalancePlan({
      valuations: state.valuations,
      cashEur: state.cash.cashEur,
      instruments: instQ.data.map(i => ({ id: i.id, ticker: i.ticker, currency: i.currency, status: i.status, quantityStep: i.quantity_step })),
      prices: inputs.prices,
      fxRates: inputs.fxRates,
      targetRows,
      applicableRegime: regimeState.applicableRegime,
      settings: {
        tolerancePp: D(settings.tolerance_pp),
        roundingEur: D(settings.rounding_eur),
        minTradeEur: D(settings.min_trade_eur),
        simulatedFeeEur: D(settings.simulated_fee_eur),
        stalePriceDays: settings.stale_price_days,
      },
      asOf,
    });
  }, [state, inputs, settings, instQ.data, targetRows, regimeState.applicableRegime, asOf]);

  // Stato sintetico del piano
  const statusLabel = useMemo(() => {
    if (!plan || plan.status === 'blocked') return { text: 'Bloccato', cls: 'bg-destructive' };
    if (regimeState.isFirstAdoption) return { text: 'Prima adozione', cls: 'bg-amber-600' };
    if (regimeState.migrationNeeded) return { text: 'Migrazione richiesta', cls: 'bg-amber-600' };
    const anyAction = plan.rows.some(r => (r.action && !r.suppressed && !r.blockedReason) || r.sellAll);
    return anyAction ? { text: 'Ribilanciamento proposto', cls: 'bg-sky-600' } : { text: 'Allineato', cls: 'bg-emerald-600' };
  }, [plan, regimeState]);

  // "Segna regime applicato": SOLO su stato CORRENTE (non simulato):
  // valorizzazione completa, target attivo, nessun fuori-target, tutte le
  // deviazioni (cash compreso) entro tolleranza.
  const canMarkApplied = useMemo(() => {
    if (!plan || plan.status !== 'ok' || !settings || !regimeState.migrationNeeded) return false;
    if (!regimeState.latestDetermined) return false;
    const tol = D(settings.tolerance_pp);
    if (plan.rows.some(r => r.sellAll)) return false;
    return plan.rows.every(r => r.deltaWeightPp.abs().lte(tol));
  }, [plan, settings, regimeState]);

  async function doMarkApplied() {
    if (!regimeState.latestDetermined) return;
    setApplying(true);
    try {
      const res = await markRegimeApplied(regimeState.latestDetermined.id);
      toast.success(res.already_applied ? 'Regime già applicato' : `Regime ${regimeLbl(res.applied_regime)} segnato come applicato`);
      qc.invalidateQueries({ queryKey: ['portfolio-meta'] });
      qc.invalidateQueries({ queryKey: ['regime-decisions'] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Operazione rifiutata');
    } finally { setApplying(false); setConfirmApply(false); }
  }

  function openProposal(r: PlanRow) {
    if (!r.instrumentId || !r.action || !r.quantity) return;
    openOpModal({
      kind: r.action,
      instrumentId: r.instrumentId,
      quantity: r.quantity.toString(),
      priceCcy: r.priceNative ? r.priceNative.toString() : undefined,
      // NIENTE grossAmountEur: il server è l'unica autorità sull'importo.
    });
  }

  if (!plan) return <div className="h-40 animate-pulse rounded bg-muted/40" />;

  return (
    <div className="space-y-4">
      {/* intestazione stato */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Badge className={`${statusLabel.cls} text-white`}>{statusLabel.text}</Badge>
            <span className="text-sm">Regime applicabile: <strong>{regimeLbl(regimeState.applicableRegime)}</strong></span>
            <span className="text-sm">Regime applicato: <strong>{regimeLbl(regimeState.lastAppliedRegime)}</strong></span>
            {plan.status === 'ok' && (
              <span className="text-sm text-muted-foreground">
                Cash: {eur(plan.cashBeforeEur)} → {eur(plan.cashAfterEur)} · commissioni simulate {eur(plan.totalFeesEur)}
              </span>
            )}
          </div>
          {canMarkApplied && (
            <Button size="sm" onClick={() => setConfirmApply(true)}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Segna regime applicato
            </Button>
          )}
        </CardContent>
      </Card>

      {plan.status === 'blocked' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Piano non disponibile: {plan.blockReasons.join('; ')}.
          </AlertDescription>
        </Alert>
      )}

      {plan.staleWarnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>Prezzi stantii (warning, il piano resta valido): {plan.staleWarnings.join(', ')}.</AlertDescription>
        </Alert>
      )}
      {plan.cashShortfall && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Cash insufficiente per il piano completo — disponibile {eur(plan.cashShortfall.availableEur)}, richiesto {eur(plan.cashShortfall.requiredEur)}. {plan.cashShortfall.reductions.join('; ')}.
          </AlertDescription>
        </Alert>
      )}

      {plan.status === 'ok' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Piano di ribilanciamento — universo completo</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Strumento</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Proposta</TableHead>
                  <TableHead className="text-right">Quantità</TableHead>
                  <TableHead className="text-right">Controvalore</TableHead>
                  <TableHead className="text-right">Dev. residua</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.rows.map(r => (
                  <TableRow key={r.instrumentId ?? 'cash'} className={r.suppressed ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      {r.ticker}
                      {r.stale && <Badge variant="outline" className="ml-2 text-amber-600">stantio</Badge>}
                      {r.sellAll && <Badge variant="destructive" className="ml-2">fuori target</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{pctS(r.currentWeightPct)}</TableCell>
                    <TableCell className="text-right font-mono">{pctS(r.targetWeightPct)}</TableCell>
                    <TableCell className={`text-right font-mono ${r.deltaWeightPp.abs().gt(0) ? '' : 'text-muted-foreground'}`}>
                      {`${r.deltaWeightPp.gte(0) ? '+' : ''}${Number(r.deltaWeightPp.toFixed(2)).toLocaleString('it-IT')} pp`}
                    </TableCell>
                    <TableCell>
                      {r.blockedReason ? <Badge variant="destructive" title={r.blockedReason}>bloccata</Badge>
                        : r.suppressed ? <span className="text-xs text-muted-foreground" title={r.suppressReason ?? ''}>soppressa — {r.suppressReason}</span>
                        : r.action ? <Badge className={r.action === 'BUY' ? 'bg-emerald-600' : 'bg-rose-600'}>{r.action}{r.sellAll ? ' totale' : ''}</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.quantity ? Number(r.quantity.toFixed(6)).toLocaleString('it-IT', { maximumFractionDigits: 6 }) : '—'}</TableCell>
                    <TableCell className="text-right font-mono">{r.estimatedEur ? eur(r.estimatedEur) : r.theoreticalEur ? `(${eur(r.theoreticalEur)})` : '—'}</TableCell>
                    <TableCell className="text-right font-mono">{r.residualDeviationPp ? `${Number(r.residualDeviationPp.toFixed(2)).toLocaleString('it-IT')} pp` : '—'}</TableCell>
                    <TableCell className="text-right">
                      {r.action && !r.suppressed && !r.blockedReason && r.quantity && r.instrumentId && (
                        <Button size="sm" variant="outline" onClick={() => openProposal(r)}>Apri {r.action}</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Solo proposte: ogni operazione va confermata nel modale e passa dalle RPC autoritative. Gli importi tra parentesi sono teorici (proposta soppressa).
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmApply} onOpenChange={setConfirmApply}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segnare il regime come applicato?</DialogTitle>
            <DialogDescription>
              Il portafoglio risulta allineato al target del regime {regimeLbl(regimeState.applicableRegime)} entro la tolleranza.
              L'azione aggiorna solo lo stato "regime applicato": non registra operazioni, non modifica i target e non effettua prese visione.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApply(false)}>Annulla</Button>
            <Button onClick={doMarkApplied} disabled={applying}>{applying ? 'In corso…' : 'Conferma'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
