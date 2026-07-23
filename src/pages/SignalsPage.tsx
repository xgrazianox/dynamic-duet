import { useMemo, useState } from 'react';
import { Radio, Play, ArrowRightLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioMeta, usePrices, useLatestDecision } from '@/hooks/usePortfolioMeta';
import {
  alignMonthlyPairs, evaluateRegime, configFromDb,
  type PricePoint, type Regime, type RawSignal, type SignalAResult, type SignalBResult,
} from '@/domain/signalEngine';
import { evaluateRegimeRemote } from '@/services/signals';

const regimeLabel = (r: Regime | null | undefined) =>
  r === 'RISK_ON' ? 'RISK-ON' : r === 'RISK_OFF' ? 'RISK-OFF' : 'Non determinato';
const regimeColor = (r: Regime | null | undefined) =>
  r === 'RISK_ON' ? 'bg-emerald-600' : r === 'RISK_OFF' ? 'bg-sky-600' : 'bg-muted-foreground';
const sigColor = (s: RawSignal) => s === 'ON' ? 'text-emerald-600' : s === 'OFF' ? 'text-sky-600' : 'text-muted-foreground';

export default function SignalsPage() {
  const { user } = useCurrentUser();
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const settings = meta.data?.settings ?? null;
  const priceQ = usePrices(portfolioId);
  const decisionQ = useLatestDecision(portfolioId);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  // LIVE PREVIEW — pure, no persistence. Uses the SAME shared engine as the Edge.
  const preview = useMemo(() => {
    if (!settings?.msci_instrument_id || !settings?.gold_instrument_id || !priceQ.data) return null;
    const toPP = (id: string): PricePoint[] => priceQ.data!
      .filter(p => p.instrument_id === id)
      .map(p => ({ date: p.price_date, close: Number(p.close_price) }));
    const currentMonth = new Date().toISOString().slice(0, 7);
    const pairs = alignMonthlyPairs(toPP(settings.msci_instrument_id), toPP(settings.gold_instrument_id), currentMonth);
    const cfg = configFromDb(settings.engine_config);
    return evaluateRegime(pairs, cfg);
  }, [settings, priceQ.data]);

  async function runEvaluation() {
    setRunning(true);
    try {
      const res = await evaluateRegimeRemote();
      if (res.data_status === 'insufficient') {
        toast.info(`Dati insufficienti (${res.available_months}/${res.required_months} mesi): nessuna decisione persistita.`);
      } else {
        toast.success(`Regime valutato: ${regimeLabel(res.final_regime as Regime)}${res.is_switch ? ' (switch)' : ''}`);
      }
      qc.invalidateQueries({ queryKey: ['latest-decision'] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Valutazione non riuscita');
    } finally { setRunning(false); }
  }

  const driversReady = !!settings?.msci_instrument_id && !!settings?.gold_instrument_id;
  const latest = decisionQ.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-2xl font-bold"><Radio className="h-7 w-7" /> Signal Engine</h1>
        <Button onClick={runEvaluation} disabled={running || !driversReady}>
          <Play className="mr-1 h-4 w-4" />{running ? 'Valutazione…' : 'Valuta regime'}
        </Button>
      </div>

      {!driversReady && (
        <Alert><AlertDescription>Configura i driver MSCI e Oro (portfolio_settings) per abilitare il motore.</AlertDescription></Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Decisione persistita</CardTitle></CardHeader>
        <CardContent>
          {latest ? (
            <div className="flex flex-wrap items-center gap-4">
              <Badge className={`${regimeColor(latest.final_regime)} text-white`}>{regimeLabel(latest.final_regime)}</Badge>
              <span className="text-sm text-muted-foreground">Mese: <span className="font-mono">{latest.as_of_month}</span></span>
              <span className="text-sm text-muted-foreground">Modalità: {latest.decision_mode}</span>
              {latest.is_switch && <Badge variant="outline" className="gap-1"><ArrowRightLeft className="h-3 w-3" />switch</Badge>}
              <span className="text-xs text-muted-foreground">motore {latest.engine_version}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessuna decisione persistita. Premi “Valuta regime”.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Anteprima (non persistita)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!preview ? (
            <p className="text-sm text-muted-foreground">In attesa dei prezzi dei driver…</p>
          ) : preview.dataStatus === 'insufficient' ? (
            <Alert>
              <AlertDescription>
                Dati insufficienti: {preview.availableMonths}/{preview.requiredMonths} mesi allineati. Nessuna decisione verrebbe persistita.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {preview.signalA && <PanelA a={preview.signalA} />}
              {preview.signalB && <PanelB b={preview.signalB} />}
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase text-muted-foreground">Decisione</p>
                <Badge className={`${regimeColor(preview.finalRegime)} mt-2 text-white`}>{regimeLabel(preview.finalRegime)}</Badge>
                <p className="mt-2 text-sm text-muted-foreground">{preview.decision?.reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">Mese di riferimento: <span className="font-mono">{preview.asOfMonth}</span></p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            L'anteprima gira sul motore condiviso lato client; la <strong>persistenza</strong> avviene solo tramite “Valuta regime” (Edge Function).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PanelA({ a }: { a: SignalAResult }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase text-muted-foreground">Sistema A — MSCI/Oro</p>
      <p className={`mt-1 text-lg font-semibold ${sigColor(a.rawSignal)}`}>{a.rawSignal}</p>
      <p className="text-sm">Regime: {regimeLabel(a.currentRegime)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{a.reason}</p>
    </div>
  );
}
function PanelB({ b }: { b: SignalBResult }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase text-muted-foreground">Sistema B — voto 2/3</p>
      <div className="mt-1 flex gap-3 text-sm">
        <span className={sigColor(b.vote.b1)}>B1 {b.vote.b1}</span>
        <span className={sigColor(b.vote.b2)}>B2 {b.vote.b2}</span>
        <span className={sigColor(b.vote.b3)}>B3 {b.vote.b3}</span>
      </div>
      <p className="text-sm">Regime: {regimeLabel(b.currentRegime)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{b.reason}</p>
    </div>
  );
}
