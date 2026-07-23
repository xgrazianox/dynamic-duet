import { useEffect, useState } from 'react';
import { Settings, Save, SlidersHorizontal, Radio } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioMeta } from '@/hooks/usePortfolioMeta';

/**
 * F6 — SettingsPage REALE: legge e scrive portfolio_settings (policy owner).
 * Prima salvava una strategyConfig mock senza alcun effetto. I campi protetti
 * (migration_completed, last_applied_regime) restano fuori: solo RPC.
 * engine_config è in sola lettura: modificarlo cambierebbe il config_hash
 * delle decisioni di regime — l'editing è rinviato a una fase dedicata.
 */
interface EditableSettings {
  tolerance_pp: string;
  rounding_eur: string;
  min_trade_eur: string;
  take_profit_pct: string;
  stale_price_days: string;
  simulated_fee_eur: string;
}
const FIELDS: { key: keyof EditableSettings; label: string; hint: string; integer?: boolean }[] = [
  { key: 'tolerance_pp', label: 'Tolleranza deviazione (pp)', hint: 'oltre questa soglia scatta l\'alert e la proposta di ribilanciamento' },
  { key: 'rounding_eur', label: 'Arrotondamento importi (€)', hint: 'gli importi proposti sono arrotondati a questo taglio' },
  { key: 'min_trade_eur', label: 'Trade minimo (€)', hint: 'proposte sotto questa soglia vengono soppresse (e dichiarate)' },
  { key: 'take_profit_pct', label: 'Take-profit (%)', hint: 'rendimento non realizzato oltre cui scatta l\'alert' },
  { key: 'stale_price_days', label: 'Prezzo stantio (giorni)', hint: 'un prezzo più vecchio genera warning', integer: true },
  { key: 'simulated_fee_eur', label: 'Commissione simulata (€)', hint: 'usata solo nel piano di ribilanciamento' },
];

export default function SettingsPage() {
  const { user } = useCurrentUser();
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const s = meta.data?.settings ?? null;
  const qc = useQueryClient();
  const [form, setForm] = useState<EditableSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (s && form === null) {
      setForm({
        tolerance_pp: s.tolerance_pp, rounding_eur: s.rounding_eur,
        min_trade_eur: s.min_trade_eur, take_profit_pct: s.take_profit_pct,
        stale_price_days: String(s.stale_price_days), simulated_fee_eur: s.simulated_fee_eur,
      });
    }
  }, [s, form]);

  const invalid = form ? FIELDS.filter(f => {
    const v = form[f.key].replace(',', '.');
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return true;
    if (f.integer && !Number.isInteger(n)) return true;
    return false;
  }) : [];

  async function onSave() {
    if (!form || !portfolioId) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('portfolio_settings').update({
        tolerance_pp: form.tolerance_pp.replace(',', '.'),
        rounding_eur: form.rounding_eur.replace(',', '.'),
        min_trade_eur: form.min_trade_eur.replace(',', '.'),
        take_profit_pct: form.take_profit_pct.replace(',', '.'),
        stale_price_days: Number(form.stale_price_days),
        simulated_fee_eur: form.simulated_fee_eur.replace(',', '.'),
      }).eq('portfolio_id', portfolioId);
      if (error) throw error;
      toast.success('Impostazioni salvate');
      qc.invalidateQueries({ queryKey: ['portfolio-meta'] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Salvataggio rifiutato');
    } finally { setSaving(false); }
  }

  const engine = s?.engine_config ?? null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold"><Settings className="h-7 w-7" /> Impostazioni</h1>
        <p className="mt-1 text-muted-foreground">Parametri operativi reali del portafoglio</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" /> Parametri operativi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!form ? <div className="h-40 animate-pulse rounded bg-muted/40" /> : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input id={f.key} inputMode="decimal" className="font-mono"
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
          )}
          {invalid.length > 0 && (
            <p className="text-sm text-destructive">Valori non validi: {invalid.map(f => f.label).join(', ')}.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={onSave} disabled={!form || invalid.length > 0 || saving}>
              <Save className="mr-1 h-4 w-4" />{saving ? 'Salvataggio…' : 'Salva impostazioni'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Signal Engine (sola lettura)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {engine ? (
            <div className="grid grid-cols-2 gap-2 font-mono text-sm md:grid-cols-3">
              <div>Modalità: {String(engine.decision_mode)}</div>
              <div>A · SMA: {String(engine.signalA?.smaMonths)}</div>
              <div>A · banda: {String(engine.signalA?.bandPct)}</div>
              <div>A · conferme: {String(engine.signalA?.confirmMonths)}</div>
              <div>B · B1 SMA/banda: {String(engine.signalB?.b1SmaMonths)}/{String(engine.signalB?.b1BandPct)}</div>
              <div>B · B2 SMA/banda: {String(engine.signalB?.b2SmaMonths)}/{String(engine.signalB?.b2BandPct)}</div>
              <div>B · B3 lookback/soglia: {String(engine.signalB?.b3VolLookback)}/{String(engine.signalB?.b3VolThreshold)}</div>
              <div>B · voti/conferme: {String(engine.signalB?.minVotesRequired)}/{String(engine.signalB?.confirmMonths)}</div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Configurazione non disponibile.</p>}
          <Alert>
            <AlertDescription>
              La configurazione del motore è in sola lettura: modificarla cambierebbe il <code>config_hash</code> delle
              decisioni di regime persistite. L'editing arriverà in una fase dedicata, con versioning esplicito.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
