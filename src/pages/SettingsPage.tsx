import { useEffect, useState } from 'react';
import { Settings, Save, SlidersHorizontal, Radio, Coins } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioMeta, useInstruments } from '@/hooks/usePortfolioMeta';
import { updatePortfolioSettings, type EngineConfigPayload, type SettingsPayload } from '@/services/settings';
import { configFromDb } from '@/domain/signalEngine';

/** F6-r2 — TUTTE le modifiche passano da update_portfolio_settings (RPC).
 * Nessun UPDATE diretto client. tilt_enabled e i campi di sistema non sono esposti. */
interface FormState {
  tolerance_pp: string; rounding_eur: string; min_trade_eur: string;
  take_profit_pct: string; stale_price_days: string; simulated_fee_eur: string;
  fx_usd: string; fx_chf: string;
  msci: string; gold: string;
  mode: EngineConfigPayload['decision_mode'];
  a_sma: string; a_band: string; a_conf: string;
  b1_sma: string; b1_band: string; b2_sma: string; b2_band: string;
  b3_look: string; b3_thr: string; b_votes: string; b_conf: string;
}
const num = (s: string) => Number(s.replace(',', '.'));
const OPERATIVE: { key: keyof FormState; label: string; hint: string; integer?: boolean }[] = [
  { key: 'tolerance_pp', label: 'Tolleranza deviazione (pp)', hint: 'oltre questa soglia scatta alert e proposta' },
  { key: 'rounding_eur', label: 'Arrotondamento importi (€)', hint: 'taglio degli importi proposti' },
  { key: 'min_trade_eur', label: 'Trade minimo (€)', hint: 'sotto soglia la proposta è soppressa e dichiarata' },
  { key: 'take_profit_pct', label: 'Take-profit (%)', hint: 'soglia dell\'alert sul non realizzato' },
  { key: 'stale_price_days', label: 'Prezzo stantio (giorni)', hint: 'oltre → warning', integer: true },
  { key: 'simulated_fee_eur', label: 'Commissione simulata (€)', hint: 'usata solo nel piano' },
];

export default function SettingsPage() {
  const { user } = useCurrentUser();
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const s = meta.data?.settings ?? null;
  const instQ = useInstruments(portfolioId);
  const active = (instQ.data ?? []).filter(i => i.status === 'active');
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (s && form === null) {
      const ec = configFromDb(s.engine_config);
      setForm({
        tolerance_pp: s.tolerance_pp, rounding_eur: s.rounding_eur, min_trade_eur: s.min_trade_eur,
        take_profit_pct: s.take_profit_pct, stale_price_days: String(s.stale_price_days),
        simulated_fee_eur: s.simulated_fee_eur,
        fx_usd: s.default_fx?.USD != null ? String(s.default_fx.USD) : '',
        fx_chf: s.default_fx?.CHF != null ? String(s.default_fx.CHF) : '',
        msci: s.msci_instrument_id ?? '', gold: s.gold_instrument_id ?? '',
        mode: ec.decision.mode,
        a_sma: String(ec.signalA.smaMonths), a_band: String(ec.signalA.bandPct), a_conf: String(ec.signalA.confirmMonths),
        b1_sma: String(ec.signalB.b1SmaMonths), b1_band: String(ec.signalB.b1BandPct),
        b2_sma: String(ec.signalB.b2SmaMonths), b2_band: String(ec.signalB.b2BandPct),
        b3_look: String(ec.signalB.b3VolLookback), b3_thr: String(ec.signalB.b3VolThreshold),
        b_votes: String(ec.signalB.minVotesRequired), b_conf: String(ec.signalB.confirmMonths),
      });
    }
  }, [s, form]);

  const set = (k: keyof FormState) => (v: string) => setForm(f => f ? { ...f, [k]: v } : f);
  const invalid = form ? [
    ...OPERATIVE.filter(f => { const n = num(form[f.key]); return !Number.isFinite(n) || n < 0 || (f.integer && !Number.isInteger(n)); }).map(f => f.label),
    ...(form.fx_usd && !(num(form.fx_usd) > 0) ? ['FX USD'] : []),
    ...(form.fx_chf && !(num(form.fx_chf) > 0) ? ['FX CHF'] : []),
    ...(['a_sma','a_conf','b1_sma','b2_sma','b3_look','b_votes','b_conf'] as const)
      .filter(k => !(Number.isInteger(num(form[k])) && num(form[k]) > 0)).map(k => `motore: ${k}`),
    ...(['a_band','b1_band','b2_band'] as const).filter(k => !(num(form[k]) >= 0)).map(k => `motore: ${k}`),
    ...(!(num(form.b3_thr) > 0) ? ['motore: b3_thr'] : []),
  ] : [];

  async function onSave() {
    if (!form || saving) return; // busy guard
    setSaving(true);
    try {
      const payload: SettingsPayload = {
        tolerance_pp: num(form.tolerance_pp), rounding_eur: num(form.rounding_eur),
        min_trade_eur: num(form.min_trade_eur), take_profit_pct: num(form.take_profit_pct),
        stale_price_days: num(form.stale_price_days), simulated_fee_eur: num(form.simulated_fee_eur),
        default_fx: {
          ...(form.fx_usd ? { USD: num(form.fx_usd) } : {}),
          ...(form.fx_chf ? { CHF: num(form.fx_chf) } : {}),
        },
        ...(form.msci ? { msci_instrument_id: form.msci } : {}),
        ...(form.gold ? { gold_instrument_id: form.gold } : {}),
        engine_config: {
          decision_mode: form.mode,
          signalA: { smaMonths: num(form.a_sma), bandPct: num(form.a_band), confirmMonths: num(form.a_conf) },
          signalB: {
            b1SmaMonths: num(form.b1_sma), b1BandPct: num(form.b1_band),
            b2SmaMonths: num(form.b2_sma), b2BandPct: num(form.b2_band),
            b3VolLookback: num(form.b3_look), b3VolThreshold: num(form.b3_thr),
            minVotesRequired: num(form.b_votes), confirmMonths: num(form.b_conf),
          },
        },
      };
      const res = await updatePortfolioSettings(payload);
      toast.success(res.noop ? 'Nessuna modifica: impostazioni già aggiornate' : 'Impostazioni salvate');
      qc.invalidateQueries({ queryKey: ['portfolio-meta'] });
      qc.invalidateQueries({ queryKey: ['portfolio-state'] });
    } catch (e) {
      toast.error('Salvataggio rifiutato', { description: (e as Error).message }); // errore server integrale
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold"><Settings className="h-7 w-7" /> Impostazioni</h1>
        <p className="mt-1 text-muted-foreground">Tutte le modifiche passano dalla RPC autoritativa</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" /> Parametri operativi</CardTitle></CardHeader>
        <CardContent>
          {!form ? <div className="h-40 animate-pulse rounded bg-muted/40" /> : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {OPERATIVE.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input id={f.key} inputMode="decimal" className="font-mono" value={form[f.key]} onChange={e => set(f.key)(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {form && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Cambi proposti e driver</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              I default FX sono SOLO proposte precompilate nei form: non sono cambi confermati di valorizzazione (quelli si confermano in Strumenti &amp; Prezzi → Cambi).
            </p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="fx_usd">Default FX USD (EUR per 1 USD)</Label>
                <Input id="fx_usd" inputMode="decimal" className="font-mono" value={form.fx_usd} onChange={e => set('fx_usd')(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="fx_chf">Default FX CHF (EUR per 1 CHF)</Label>
                <Input id="fx_chf" inputMode="decimal" className="font-mono" value={form.fx_chf} onChange={e => set('fx_chf')(e.target.value)} /></div>
              <div className="space-y-1"><Label>Driver MSCI</Label>
                <Select value={form.msci || undefined} onValueChange={set('msci')}>
                  <SelectTrigger aria-label="Driver MSCI"><SelectValue placeholder="Seleziona" /></SelectTrigger>
                  <SelectContent>{active.map(i => <SelectItem key={i.id} value={i.id}>{i.ticker}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Driver Oro</Label>
                <Select value={form.gold || undefined} onValueChange={set('gold')}>
                  <SelectTrigger aria-label="Driver Oro"><SelectValue placeholder="Seleziona" /></SelectTrigger>
                  <SelectContent>{active.map(i => <SelectItem key={i.id} value={i.id}>{i.ticker}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
          </CardContent>
        </Card>
      )}

      {form && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Signal Engine</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                Le modifiche al motore valgono <strong>dalla prossima valutazione</strong> (nuovo <code>config_hash</code>):
                le decisioni già persistite conservano la propria configurazione e il proprio hash.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="col-span-2 space-y-1"><Label>Modalità decisione</Label>
                <Select value={form.mode} onValueChange={v => setForm(f => f ? { ...f, mode: v as FormState['mode'] } : f)}>
                  <SelectTrigger aria-label="Modalità decisione"><SelectValue /></SelectTrigger>
                  <SelectContent>{(['A_AND_B','A_OR_B','USE_A','USE_B','A_PRIORITY'] as const).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select></div>
              {([['a_sma','A · SMA mesi'],['a_band','A · banda'],['a_conf','A · conferme'],
                 ['b1_sma','B1 · SMA'],['b1_band','B1 · banda'],['b2_sma','B2 · SMA'],['b2_band','B2 · banda'],
                 ['b3_look','B3 · lookback'],['b3_thr','B3 · soglia vol'],['b_votes','B · voti min'],['b_conf','B · conferme']] as const)
                .map(([k, label]) => (
                  <div key={k} className="space-y-1"><Label htmlFor={k}>{label}</Label>
                    <Input id={k} inputMode="decimal" className="font-mono" value={form[k]} onChange={e => set(k)(e.target.value)} /></div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {invalid.length > 0 && <p className="text-sm text-destructive">Valori non validi: {invalid.join(', ')}.</p>}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={!form || invalid.length > 0 || saving}>
          <Save className="mr-1 h-4 w-4" />{saving ? 'Salvataggio…' : 'Salva impostazioni'}
        </Button>
      </div>
    </div>
  );
}
