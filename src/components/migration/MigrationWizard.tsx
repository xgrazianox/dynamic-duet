import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

type Mode = 'import' | 'blank' | 'amend';
type Instrument = { id: string; ticker: string; name: string; currency: 'EUR' | 'USD' | 'CHF'; instrument_type: string };

/**
 * Preset SOLO su costo medio e flag di inclusione — MAI sulla valuta,
 * che va SEMPRE letta dall'anagrafica persistita (`instruments.currency`).
 * Convenzione FX: EUR per 1 unità di valuta estera.
 *   • 1 USD ≈ 0.9259 EUR (proposta di default, l'utente conferma).
 *   • 1.08 è la convenzione INVERSA (USD-per-EUR) e non deve mai essere usata.
 */
const DEFAULT_FX_EUR_PER_UNIT: Partial<Record<string, string>> = {
  USD: '0.9259',
  CHF: '1.05',
};
const PRESETS: Record<string, { qty: number; avg: number; price: number; include: boolean }> = {
  WORLDCORE: { qty: 0, avg: 0,     price: 0,   include: false },
  QUALITY:   { qty: 0, avg: 0,     price: 0,   include: false },
  VALUE:     { qty: 0, avg: 0,     price: 0,   include: false },
  NASDAQ:    { qty: 0, avg: 0,     price: 0,   include: false },
  DEFENSE:   { qty: 0, avg: 0,     price: 0,   include: false },
  UTILITIES: { qty: 0, avg: 0,     price: 0,   include: false },
  COPPER:    { qty: 0, avg: 0,     price: 0,   include: false },
  URANIUM:   { qty: 0, avg: 0,     price: 0,   include: false },
  CLEAN:     { qty: 0, avg: 9.20,  price: 0,   include: false },
  GOLD:      { qty: 0, avg: 0,     price: 0,   include: false },
  XEON:      { qty: 0, avg: 100,   price: 100, include: true },
};

interface Row {
  instrument_id: string;
  ticker: string;
  currency: string;
  include: boolean;
  quantity: string;
  average_cost_eur: string;
  opening_price_ccy: string;
  opening_fx: string;
}

function todayFirstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * batchKey persistente in sessionStorage, per utente+portfolio+bozza.
 * Sopravvive a remount, refresh e "risposte di rete perse". Eliminato solo
 * quando la rilettura server conferma che la migrazione è completata.
 */
/**
 * Batch key persistente per (utente, portfolio, NAMESPACE).
 * NAMESPACE distingue 'import' e 'amend': una chiave chiusa per import
 * non può essere riusata per amend, e viceversa.
 */
type BatchNs = 'import' | 'amend';
function batchKeyStorageId(userId: string, portfolioId: string, ns: BatchNs) {
  return `migration:batchKey:${ns}:${userId}:${portfolioId}`;
}
function usePersistentBatchKey(userId: string | null, portfolioId: string | null, ns: BatchNs) {
  return useMemo(() => {
    if (!userId || !portfolioId) return null;
    const k = batchKeyStorageId(userId, portfolioId, ns);
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      sessionStorage.setItem(k, v);
    }
    return v;
  }, [userId, portfolioId, ns]);
}
function clearAllBatchKeys(userId: string, portfolioId: string) {
  sessionStorage.removeItem(batchKeyStorageId(userId, portfolioId, 'import'));
  sessionStorage.removeItem(batchKeyStorageId(userId, portfolioId, 'amend'));
}

export function MigrationWizard({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('import');
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [openingDate, setOpeningDate] = useState(todayFirstOfMonth());
  const [openingCash, setOpeningCash] = useState('0');
  const [busy, setBusy] = useState(false);
  const [canAmend, setCanAmend] = useState(false);
  const [origBatchId, setOrigBatchId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const importBatchKey = usePersistentBatchKey(userId, portfolioId, 'import');
  const amendBatchKey  = usePersistentBatchKey(userId, portfolioId, 'amend');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: pf } = await supabase.from('portfolios').select('id').eq('user_id', user.id).maybeSingle();
      if (!pf) return;
      setPortfolioId(pf.id);
      // Se il server ha già completato la migrazione, elimino la chiave import
      // rimasta appesa dopo una risposta persa (evita cicli di retry).
      const { data: st } = await supabase.from('portfolio_settings')
        .select('migration_completed').eq('portfolio_id', pf.id).maybeSingle();
      if (st?.migration_completed) {
        sessionStorage.removeItem(batchKeyStorageId(user.id, pf.id, 'import'));
      }
      const { data: ins } = await supabase.from('instruments')
        .select('id,ticker,name,currency,instrument_type').eq('portfolio_id', pf.id).order('ticker');
      const list = (ins ?? []) as Instrument[];
      setInstruments(list);
      setRows(list.map((i) => {
        const preset = PRESETS[i.ticker] ?? { qty: 0, avg: 0, price: 0, include: false };
        // La valuta arriva SEMPRE dall'anagrafica persistita, mai da preset locali.
        const fxDefault = i.currency === 'EUR' ? '1' : (DEFAULT_FX_EUR_PER_UNIT[i.currency] ?? '');
        return {
          instrument_id: i.id,
          ticker: i.ticker,
          currency: i.currency,
          include: preset.include,
          quantity: String(preset.qty),
          average_cost_eur: String(preset.avg),
          opening_price_ccy: String(preset.price),
          opening_fx: fxDefault,
        };
      }));

      // Check amend-window: ci sono opening già, ma nessuna operazione ordinaria?
      const { data: opsAll } = await supabase.from('operations').select('op_type,source_batch_id').eq('portfolio_id', pf.id);
      const openings = (opsAll ?? []).filter((o) => o.op_type === 'OPENING_POSITION' || o.op_type === 'OPENING_CASH');
      const ordinary = (opsAll ?? []).filter((o) => ['BUY','SELL','DEPOSIT','WITHDRAW','DIVIDEND','OTHER_INCOME','FEE'].includes(o.op_type));
      if (openings.length > 0 && ordinary.length === 0) {
        setCanAmend(true);
        setOrigBatchId(openings[0].source_batch_id ?? null);
      }
    })();
  }, []);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => i === idx ? { ...row, ...patch } : row));
  }

  function finish() {
    if (userId && portfolioId) clearAllBatchKeys(userId, portfolioId);
    onDone();
  }

  async function confirmBlank() {
    if (busy || !importBatchKey) return;   // no double submit
    setBusy(true);
    try {
      const cash = Number(openingCash) || 0;
      const { error } = await supabase.rpc('import_opening_balances', {
        _key: importBatchKey,
        _payload: { opening_date: openingDate, opening_cash: cash, positions: [], fxs: [] } as never,
      });
      if (error) throw error;
      toast({ title: 'Portafoglio inizializzato' });
      finish();
    } catch (err) {
      toast({ title: 'Errore', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function confirmImport() {
    const key = mode === 'amend' ? amendBatchKey : importBatchKey;
    if (busy || !key) return;
    setBusy(true);
    try {
      const positions = rows.filter((r) => r.include && Number(r.quantity) > 0).map((r) => ({
        instrument_id: r.instrument_id,
        quantity: Number(r.quantity),
        average_cost_eur: Number(r.average_cost_eur),
        opening_price_ccy: Number(r.opening_price_ccy),
        opening_fx: r.currency === 'EUR' ? undefined : Number(r.opening_fx),
      }));
      // FX unici per valuta non-EUR
      const fxs = Array.from(new Set(positions
        .filter((p, _i) => p.opening_fx !== undefined)
        .map((p) => {
          const r = rows.find((rr) => rr.instrument_id === p.instrument_id)!;
          return `${r.currency}|${p.opening_fx}`;
        })))
        .map((k) => { const [currency, fx] = k.split('|'); return { currency, eur_per_unit: Number(fx) }; });

      const payload = {
        opening_date: openingDate,
        opening_cash: Number(openingCash) || 0,
        positions,
        fxs,
      };
      const rpc = mode === 'amend' ? 'amend_opening_import' : 'import_opening_balances';
      const body = mode === 'amend' ? { ...payload, original_batch_id: origBatchId } : payload;
      const { error } = await supabase.rpc(rpc, { _key: key, _payload: body as never });
      if (error) {
        // "stessa chiave, payload diverso" → NON retry ciclico: forza rilettura server
        if (/idempotency conflict/i.test(error.message ?? '')) {
          toast({ title: 'Conflitto idempotenza', description: 'Rileggo lo stato del server…', variant: 'destructive' });
          if (userId && portfolioId) clearAllBatchKeys(userId, portfolioId);
          onDone();
          return;
        }
        throw error;
      }
      toast({ title: mode === 'amend' ? 'Importazione corretta' : 'Importazione completata' });
      finish();
    } catch (err) {
      toast({ title: 'Errore', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  // STEP 0: scelta modalità
  if (step === 0) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Configurazione iniziale del portafoglio</CardTitle>
          <CardDescription>Serve una sola volta per definire la posizione di apertura.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer">
              <RadioGroupItem value="import" id="m-import" />
              <div><div className="font-medium">Importa portafoglio esistente</div>
                <div className="text-sm text-muted-foreground">Precompila con l'anagrafica corretta (XEON incluso come strumento).</div></div>
            </label>
            <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer">
              <RadioGroupItem value="blank" id="m-blank" />
              <div><div className="font-medium">Parti da zero</div>
                <div className="text-sm text-muted-foreground">Solo cash iniziale (anche 0).</div></div>
            </label>
            {canAmend && (
              <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer">
                <RadioGroupItem value="amend" id="m-amend" />
                <div><div className="font-medium">Correggi importazione</div>
                  <div className="text-sm text-muted-foreground">Storna l'apertura precedente e ne registra una nuova (finestra ancora aperta).</div></div>
              </label>
            )}
          </RadioGroup>
          <div className="flex justify-end mt-6">
            <Button onClick={() => setStep(mode === 'blank' ? 2 : 1)}>Avanti</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // STEP 1: posizioni (solo import/amend)
  if (step === 1) {
    return (
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Posizioni di apertura</CardTitle>
          <CardDescription>Includi solo le posizioni presenti al {openingDate}. Costo medio storico in EUR.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Includi</TableHead>
                <TableHead>Strumento</TableHead>
                <TableHead>Valuta</TableHead>
                <TableHead>Quantità</TableHead>
                <TableHead>Costo medio (EUR)</TableHead>
                <TableHead>Prezzo apertura (nativo)</TableHead>
                <TableHead>FX apertura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.instrument_id}>
                  <TableCell><Switch checked={r.include} onCheckedChange={(v) => updateRow(i, { include: v })} /></TableCell>
                  <TableCell>{r.ticker}</TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell><Input type="number" step="1" value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} disabled={!r.include} /></TableCell>
                  <TableCell><Input type="number" step="0.0001" value={r.average_cost_eur} onChange={(e) => updateRow(i, { average_cost_eur: e.target.value })} disabled={!r.include} /></TableCell>
                  <TableCell><Input type="number" step="0.0001" value={r.opening_price_ccy} onChange={(e) => updateRow(i, { opening_price_ccy: e.target.value })} disabled={!r.include} /></TableCell>
                  <TableCell>
                    {r.currency === 'EUR' ? (
                      <span className="text-xs text-muted-foreground">— (EUR)</span>
                    ) : (
                      <div className="space-y-1">
                        <Input type="number" step="0.0001" value={r.opening_fx}
                          onChange={(e) => updateRow(i, { opening_fx: e.target.value })} disabled={!r.include} />
                        <div className="text-xs text-muted-foreground">
                          1 {r.currency} = {r.opening_fx || '—'} EUR
                        </div>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep(0)}>Indietro</Button>
            <Button onClick={() => setStep(2)}>Avanti</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // STEP 2: cash iniziale + data + conferma
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Cash iniziale e conferma</CardTitle>
        <CardDescription>Il default 0 non genera alcuna riga di cash.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div><Label>Data di apertura</Label><Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} /></div>
        <div><Label>Cash iniziale (EUR)</Label><Input type="number" step="0.01" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setStep(mode === 'blank' ? 0 : 1)}>Indietro</Button>
          <Button onClick={mode === 'blank' ? confirmBlank : confirmImport} disabled={busy}>
            {busy ? 'Salvataggio…' : 'Conferma'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}