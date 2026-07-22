import { Wallet, TrendingUp, TrendingDown, Layers, Plus, Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioState } from '@/hooks/usePortfolioState';
import { useOperationModal } from '@/contexts/operationModalStore';
import { FeaturePlaceholder, SIGNAL_ENGINE_PLACEHOLDER } from '@/components/common/FeaturePlaceholder';
import type { Decimal } from '@/domain/decimal';

// ── formatters (presentation-only, nessuna matematica) ──────────────────────
function eur(v: Decimal | null | undefined): string {
  if (v === null || v === undefined) return 'n/d';
  return `€${Number(v.toFixed(2)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function signedEur(v: Decimal | null | undefined): { text: string; positive: boolean | null } {
  if (v === null || v === undefined) return { text: 'n/d', positive: null };
  const positive = !v.isNegative();
  return { text: `${positive ? '+' : ''}${eur(v)}`, positive };
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function PnlCard({ label, v }: { label: string; v: Decimal | null | undefined }) {
  const { text, positive } = signedEur(v);
  const color = positive === null ? '' : positive ? 'text-emerald-600' : 'text-rose-600';
  const Icon = positive === null ? Info : positive ? TrendingUp : TrendingDown;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className={`h-4 w-4 ${color}`} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`font-mono text-2xl font-bold ${color}`}>{text}</div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useCurrentUser();
  const { state, isLoading, isError } = usePortfolioState(user?.id ?? null);
  const { open: openOpModal } = useOperationModal();

  const currentMonth = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{currentMonth}</p>
      </div>
      <Button onClick={() => openOpModal({ kind: 'BUY' })}>
        <Plus className="mr-1 h-4 w-4" />
        Nuova operazione
      </Button>
    </div>
  );

  // ── Loading / errore / vuoto ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="h-24 animate-pulse bg-muted/40" /></Card>
          ))}
        </div>
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div className="space-y-6">
        {header}
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Errore nella lettura del portafoglio. Riprova più tardi.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const t = state.totals;
  const isEmpty = t.openPositionsCount === 0 && t.cashEur.isZero()
    && t.realizedPnlEur.isZero() && t.incomeEur.isZero() && t.feesEur.isZero();

  if (isEmpty) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Portafoglio vuoto. Registra un versamento o importa le posizioni iniziali per iniziare.
            </p>
            <Button onClick={() => openOpModal({ kind: 'DEPOSIT' })}>
              <Plus className="mr-1 h-4 w-4" /> Registra versamento
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Strumenti con valorizzazione mancante (solo posizioni aperte)
  const missing = state.valuations.filter((v) => v.status !== 'valued' && v.quantity.gt(0));

  return (
    <div className="space-y-6">
      {header}

      {t.hasMissingValuations && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Valore totale, pesi e P/L non realizzato sono <strong>n/d</strong>: manca la valorizzazione
            di {missing.length} strument{missing.length === 1 ? 'o' : 'i'}
            {' '}({missing.map((m) => `${m.instrumentId.slice(0, 8)}… (${m.status === 'missing_price' ? 'prezzo mancante' : `cambio ${m.currency} mancante`})`).join(', ')}).
            Cash e P/L realizzato restano disponibili.
          </AlertDescription>
        </Alert>
      )}

      {/* Valori sempre determinabili dal ledger + valore totale (n/d se mancano valorizzazioni) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Valore totale" value={eur(t.totalValueEur)} hint="cash + posizioni valorizzate" />
        <StatCard label="Liquidità (cash)" value={eur(t.cashEur)} />
        <StatCard label="Posizioni aperte" value={String(t.openPositionsCount)} />
        <PnlCard label="P/L gestionale" v={t.managerialPnlEur} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PnlCard label="P/L realizzato" v={t.realizedPnlEur} />
        <PnlCard label="P/L non realizzato" v={t.unrealizedPnlEur} />
        <StatCard
          label="Proventi / Costi"
          value={`${eur(t.incomeEur)} / ${eur(t.feesEur)}`}
          hint="dividendi + altri proventi / commissioni"
        />
      </div>

      {/* Signal Engine: placeholder neutro fino alla F3 (nessun output mock) */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Layers className="h-4 w-4" /> Signal Engine
        </div>
        <FeaturePlaceholder message={SIGNAL_ENGINE_PLACEHOLDER} />
      </div>
    </div>
  );
}
