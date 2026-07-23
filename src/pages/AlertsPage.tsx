import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Info, XCircle, Bell, Eye, History } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioState } from '@/hooks/usePortfolioState';
import { usePortfolioMeta, useInstruments, useTargets, useRegimeDecisions } from '@/hooks/usePortfolioMeta';
import { useOperationModal } from '@/contexts/operationModalStore';
import { D } from '@/domain/decimal';
import { computeRegimeState } from '@/domain/regimeState';
import { computeRebalancePlan } from '@/domain/rebalance';
import { deriveAlerts, type F5Alert, type F5AlertSeverity } from '@/domain/alerts';
import { acknowledgeRegimeEvent } from '@/services/regime';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sevCfg: Record<F5AlertSeverity, { icon: typeof Info; cls: string; label: string }> = {
  INFO: { icon: Info, cls: 'text-sky-600', label: 'Info' },
  WARNING: { icon: AlertTriangle, cls: 'text-amber-600', label: 'Attenzione' },
  CRITICAL: { icon: XCircle, cls: 'text-destructive', label: 'Critico' },
};

export default function AlertsPage() {
  const { user } = useCurrentUser();
  const { data: inputs, state } = usePortfolioState(user?.id ?? null);
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const settings = meta.data?.settings ?? null;
  const instQ = useInstruments(portfolioId);
  const tgtQ = useTargets(portfolioId);
  const decQ = useRegimeDecisions(portfolioId);
  const navigate = useNavigate();
  const { open: openOpModal } = useOperationModal();
  const qc = useQueryClient();
  const [ackBusy, setAckBusy] = useState<string | null>(null);
  const asOf = todayIso();

  const regimeState = useMemo(
    () => computeRegimeState(decQ.data ?? [], settings?.last_applied_regime ?? null),
    [decQ.data, settings?.last_applied_regime],
  );

  const { alerts, hasActiveTarget } = useMemo(() => {
    if (!state || !inputs || !settings || !instQ.data || !tgtQ.data) {
      return { alerts: [] as F5Alert[], hasActiveTarget: false };
    }
    const active = regimeState.applicableRegime
      ? tgtQ.data.sets.find(s => s.regime === regimeState.applicableRegime && s.status === 'active')
      : undefined;
    const targetRows = active
      ? tgtQ.data.allocs.filter(a => a.target_set_id === active.id)
          .map(a => ({ instrumentId: a.instrument_id, weightPct: D(a.weight) }))
      : null;
    const plan = computeRebalancePlan({
      valuations: state.valuations,
      cashEur: state.cash.cashEur,
      instruments: instQ.data.map(i => ({ id: i.id, ticker: i.ticker, currency: i.currency, status: i.status, quantityStep: i.quantity_step })),
      prices: inputs.prices, fxRates: inputs.fxRates,
      targetRows, applicableRegime: regimeState.applicableRegime,
      settings: {
        tolerancePp: D(settings.tolerance_pp), roundingEur: D(settings.rounding_eur),
        minTradeEur: D(settings.min_trade_eur), simulatedFeeEur: D(settings.simulated_fee_eur),
        stalePriceDays: settings.stale_price_days,
      },
      asOf,
    });
    const alerts = deriveAlerts({
      valuations: state.valuations,
      instruments: instQ.data.map(i => ({ id: i.id, ticker: i.ticker })),
      regimeState, hasActiveTargetForApplicable: !!active, plan,
      takeProfitPct: D(settings.take_profit_pct),
      stalePriceDays: settings.stale_price_days,
      tolerancePp: D(settings.tolerance_pp),
      asOf,
    });
    return { alerts, hasActiveTarget: !!active };
  }, [state, inputs, settings, instQ.data, tgtQ.data, regimeState, asOf]);

  const derived = alerts.filter(a => a.kind === 'DERIVED');
  const events = alerts.filter(a => a.kind === 'REGIME_EVENT');
  const ackedHistory = (decQ.data ?? []).filter(d => d.is_switch && d.acknowledged_at !== null);

  function runAction(a: F5Alert) {
    if (a.action.to === 'modal:SELL' && a.instrumentId) {
      openOpModal({ kind: 'SELL', instrumentId: a.instrumentId });
    } else if (a.action.to.startsWith('/')) {
      navigate(a.action.to);
    }
  }

  async function doAck(decisionId: string) {
    setAckBusy(decisionId);
    try {
      await acknowledgeRegimeEvent(decisionId);
      toast.success('Presa visione registrata');
      qc.invalidateQueries({ queryKey: ['regime-decisions'] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Operazione rifiutata');
    } finally { setAckBusy(null); }
  }

  const AlertCard = ({ a }: { a: F5Alert }) => {
    const S = sevCfg[a.severity];
    return (
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <S.icon className={`mt-0.5 h-5 w-5 shrink-0 ${S.cls}`} />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.title}</span>
                <Badge variant="outline" className={S.cls}>{S.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{a.reason}</p>
              <p className="text-xs text-muted-foreground">
                Corrente: <span className="font-mono">{a.current}</span> · Soglia: <span className="font-mono">{a.threshold}</span>
              </p>
              <p className="text-xs text-muted-foreground">Rientra quando: {a.exitCondition}</p>
            </div>
          </div>
          {a.kind === 'REGIME_EVENT' && a.decisionId ? (
            <Button size="sm" disabled={ackBusy === a.decisionId} onClick={() => doAck(a.decisionId as string)}>
              <Eye className="mr-1 h-4 w-4" />{ackBusy === a.decisionId ? 'In corso…' : 'Presa visione'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => runAction(a)}>{a.action.label}</Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-2xl font-bold"><Bell className="h-7 w-7" /> Alert</h1>
        <Badge variant="outline">{alerts.length} attivi</Badge>
      </div>

      {/* 1) Eventi di regime */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Eventi di regime</h2>
        {events.length === 0
          ? <p className="text-sm text-muted-foreground">Nessun evento di regime in attesa di presa visione.</p>
          : events.map(a => <AlertCard key={a.id} a={a} />)}
        {ackedHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Storico eventi</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {ackedHistory.map(d => (
                <div key={d.id} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Badge variant="secondary">Presa visione</Badge>
                  <span>Switch → {d.final_regime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'} (mese {d.as_of_month.slice(0, 7)})</span>
                  <span className="font-mono text-xs">{d.acknowledged_at?.slice(0, 10)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* 2) Condizioni derivate */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Condizioni attive (derivate dai dati)</h2>
        {derived.length === 0
          ? <p className="text-sm text-muted-foreground">Nessuna condizione attiva: portafoglio in ordine rispetto a target e parametri.</p>
          : derived.map(a => <AlertCard key={a.id} a={a} />)}
        <p className="text-xs text-muted-foreground">
          Le condizioni derivate non si "risolvono" a mano: rientrano da sole quando i dati tornano nei parametri.
        </p>
      </section>

      {/* 3) Parametri reali */}
      {settings && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Parametri attivi</h2>
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-3">
              <div>Tolleranza: <span className="font-mono">{settings.tolerance_pp} pp</span></div>
              <div>Take-profit: <span className="font-mono">{settings.take_profit_pct}%</span></div>
              <div>Prezzo stantio: <span className="font-mono">&gt; {settings.stale_price_days} giorni</span></div>
              <div>Arrotondamento: <span className="font-mono">€{settings.rounding_eur}</span></div>
              <div>Trade minimo: <span className="font-mono">€{settings.min_trade_eur}</span></div>
              <div>Commissione simulata: <span className="font-mono">€{settings.simulated_fee_eur}</span></div>
            </CardContent>
          </Card>
          {!hasActiveTarget && regimeState.applicableRegime && (
            <p className="text-xs text-muted-foreground">Nota: nessun target attivo per il regime applicabile — le deviazioni non sono calcolabili.</p>
          )}
        </section>
      )}
    </div>
  );
}
