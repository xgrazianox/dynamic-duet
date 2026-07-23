import { useMemo } from 'react';
import { Info, TrendingUp, TrendingDown, Percent, Trophy } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioState } from '@/hooks/usePortfolioState';
import { usePortfolioMeta } from '@/hooks/usePortfolioMeta';
import { computePerformance, type DietzResult } from '@/domain/performance';
import type { Decimal } from '@/domain/decimal';
import { formatEur } from '@/lib/formatEur';

/** Data di CALENDARIO LOCALE (non UTC): dopo la mezzanotte italiana non deve
 *  comparire il giorno precedente. Debito noto: stessa correzione da estendere
 *  altrove (InputsPage usa ancora toISOString) — fuori scope di questo hotfix. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── presentazione (ROUND_HALF_UP solo qui) ──────────────────────────────────
const eur = formatEur; // helper condiviso (F6-r2.1)
function signedEur(v: Decimal | null | undefined): { text: string; positive: boolean | null } {
  if (v === null || v === undefined) return { text: 'n/d', positive: null };
  const positive = !v.isNegative();
  return { text: `${positive ? '+' : ''}${eur(v)}`, positive };
}
function pctStr(v: Decimal | null | undefined): string {
  if (v === null || v === undefined) return 'n/d';
  const n = Number(v.toFixed(4));
  return `${n > 0 ? '+' : ''}${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

function StatCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: 'pos' | 'neg' | null }) {
  const color = tone === 'pos' ? 'text-emerald-600' : tone === 'neg' ? 'text-rose-600' : '';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">{icon}{label}</CardTitle>
      </CardHeader>
      <CardContent><div className={`font-mono text-2xl font-bold ${color}`}>{value}</div></CardContent>
    </Card>
  );
}

export default function PerformancePage() {
  const { user } = useCurrentUser();
  const { data: inputs, state, isLoading } = usePortfolioState(user?.id ?? null);
  const meta = usePortfolioMeta(user?.id ?? null);
  const trackingStartedOn = meta.data?.trackingStartedOn ?? null;
  const stalePriceDays = meta.data?.settings?.stale_price_days ?? 45; // fallback SOLO se il setting non è disponibile
  const asOf = todayIso();

  // Un solo calcolo, memoizzato: nessuna matematica finanziaria nei componenti.
  const perf = useMemo(() => {
    if (!inputs) return null;
    return computePerformance({
      operations: inputs.operations,
      instruments: inputs.instruments,
      prices: inputs.prices,
      fxRates: inputs.fxRates,
      trackingStartedOn,
      asOf,
      stalePriceDays,
    });
  }, [inputs, trackingStartedOn, asOf, stalePriceDays]);

  const managerial = state?.totals.managerialPnlEur ?? null;
  const managerialSigned = signedEur(managerial);

  // ultima mensilità VALIDA (rendimento ok più recente)
  const lastValidMonthly: DietzResult | undefined = useMemo(
    () => perf?.monthly.slice().reverse().find(m => m.status === 'ok'),
    [perf],
  );

  const chartData = useMemo(
    () => (perf?.valueSeries ?? []).map(p => ({
      date: p.date,
      value: p.value === null ? null : Number(p.value.toFixed(2)),
      status: p.status, stale: p.stale, reason: p.reason,
    })),
    [perf],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rendimenti &amp; P/L</h1>
        <p className="text-muted-foreground">
          {trackingStartedOn ? <>Rendimento al <span className="font-mono">{perf?.lastValuationDate ?? asOf}</span></> : 'Monitoraggio non ancora avviato'}
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Il <strong>valore del portafoglio</strong> risente di depositi e prelievi; il <strong>rendimento Modified Dietz</strong> li considera come flussi esterni ponderati.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="P/L gestionale" value={managerialSigned.text}
          icon={managerialSigned.positive === false ? <TrendingDown className="h-4 w-4 text-rose-600" /> : <TrendingUp className="h-4 w-4 text-emerald-600" />}
          tone={managerialSigned.positive === null ? null : managerialSigned.positive ? 'pos' : 'neg'} />
        <StatCard label="Modified Dietz dal primo monitoraggio" value={pctStr(perf?.sinceInception.returnPct)}
          icon={<Percent className="h-4 w-4" />}
          tone={perf?.sinceInception.returnPct == null ? null : perf.sinceInception.returnPct.isNegative() ? 'neg' : 'pos'} />
        <StatCard label={`Ultima mensilità${lastValidMonthly ? ` (${lastValidMonthly.label})` : ''}`} value={pctStr(lastValidMonthly?.returnPct)}
          icon={<Percent className="h-4 w-4" />}
          tone={lastValidMonthly?.returnPct == null ? null : lastValidMonthly.returnPct.isNegative() ? 'neg' : 'pos'} />
        <StatCard label="Vendite in utile" value={perf ? (perf.winRate.ratePct === null ? 'n/d' : `${Number(perf.winRate.ratePct.toFixed(1))}%`) : 'n/d'}
          icon={<Trophy className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>Valore del portafoglio</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="h-72 animate-pulse rounded bg-muted/40" /> : chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nessun dato: avvia il monitoraggio e inserisci prezzi.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => `€${Number(v).toLocaleString('it-IT')}`} />
                <RTooltip content={<ValueTooltip />} />
                {/* connectNulls=false → i punti n/d spezzano davvero la linea (nessuna interpolazione) */}
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="mt-2 text-xs text-muted-foreground">I tratti mancanti corrispondono a date senza valorizzazione (nessuna interpolazione).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rendimenti mensili (Modified Dietz)</CardTitle></CardHeader>
        <CardContent>
          {!perf || perf.monthly.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nessun mese concluso da mostrare.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">VI</TableHead>
                    <TableHead className="text-right">VF</TableHead>
                    <TableHead className="text-right">Flussi esterni netti</TableHead>
                    <TableHead className="text-right">Rendimento</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perf.monthly.slice().reverse().map(m => (
                    <TableRow key={m.periodEnd}>
                      <TableCell className="font-mono text-sm">{m.periodStart} → {m.periodEnd}</TableCell>
                      <TableCell className="text-right font-mono">{eur(m.vi)}</TableCell>
                      <TableCell className="text-right font-mono">{eur(m.vf)}</TableCell>
                      <TableCell className="text-right font-mono">{eur(m.netFlows)}</TableCell>
                      <TableCell className={`text-right font-mono ${m.returnPct == null ? '' : m.returnPct.isNegative() ? 'text-rose-600' : 'text-emerald-600'}`}>{pctStr(m.returnPct)}</TableCell>
                      <TableCell>{m.status === 'ok' ? <Badge variant="outline" className="bg-emerald-600/10">ok</Badge> : <Badge variant="secondary" title={m.reason}>n/d</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {perf && (
            <p className="mt-3 text-xs text-muted-foreground">
              Vendite — in utile: {perf.winRate.wins} · in perdita: {perf.winRate.losses} · in pareggio: {perf.winRate.breakeven} · totale: {perf.winRate.total}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ValueTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
      <div className="font-mono">{p.date}</div>
      {p.value === null
        ? <div className="text-muted-foreground">n/d — {p.reason}</div>
        : <div className="font-mono">€{Number(p.value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}{p.stale ? ' · prezzo stantio' : ''}</div>}
    </div>
  );
}
