import { useMemo, useState } from 'react';
import { Database, Plus, Archive, RotateCcw, Upload, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioMeta, useInstruments, usePrices, type InstrumentFull } from '@/hooks/usePortfolioMeta';
import {
  createInstrument, archiveInstrument, reactivateInstrument, upsertPrices, confirmFx,
  parsePriceCsv, type CurrencyCode, type InstrumentType, type RegimeClass, type Sleeve,
} from '@/services/inputs';

const CURRENCIES: CurrencyCode[] = ['EUR', 'USD', 'CHF'];
const TYPES: InstrumentType[] = ['ETF', 'ETC', 'STOCK', 'FUND', 'MONETARY'];
const CLASSES: RegimeClass[] = ['BOTH', 'AGGRESSIVE', 'DEFENSIVE'];
const SLEEVES: Sleeve[] = ['CORE', 'FACTOR', 'THEME', 'HEDGE', 'MONETARY'];
const todayIso = () => {
  // Data di CALENDARIO LOCALE (debito F4 saldato): niente UTC dopo mezzanotte.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

function errMsg(e: unknown, fallback: string): string {
  const m = (e as { message?: string })?.message;
  return m ? `${fallback}: ${m}` : fallback;
}

export default function InputsPage() {
  const { user } = useCurrentUser();
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const stale = meta.data?.settings?.stale_price_days ?? 45;
  const defaultFx = meta.data?.settings?.default_fx ?? {};
  const instQ = useInstruments(portfolioId);
  const priceQ = usePrices(portfolioId);
  const qc = useQueryClient();

  const instruments = instQ.data ?? [];
  const active = instruments.filter(i => i.status === 'active');

  const latestByInstrument = useMemo(() => {
    const m = new Map<string, { date: string; price: string; source: string }>();
    for (const p of priceQ.data ?? []) {
      const cur = m.get(p.instrument_id);
      if (!cur || p.price_date > cur.date) m.set(p.instrument_id, { date: p.price_date, price: p.close_price, source: p.source });
    }
    return m;
  }, [priceQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['instruments-full'] });
    qc.invalidateQueries({ queryKey: ['prices-full'] });
    qc.invalidateQueries({ queryKey: ['portfolio-state'] });
  };

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <Database className="h-7 w-7" /> Strumenti &amp; Prezzi
      </h1>

      <Tabs defaultValue="instruments">
        <TabsList>
          <TabsTrigger value="instruments">Strumenti</TabsTrigger>
          <TabsTrigger value="prices">Prezzi</TabsTrigger>
          <TabsTrigger value="fx">Cambi</TabsTrigger>
        </TabsList>

        <TabsContent value="instruments" className="space-y-4">
          <div className="flex justify-end">
            <NewInstrumentDialog portfolioId={portfolioId} onDone={invalidate} />
          </div>
          <Card>
            <CardHeader><CardTitle>Anagrafica strumenti</CardTitle></CardHeader>
            <CardContent>
              {instQ.isLoading ? <div className="h-32 animate-pulse rounded bg-muted/40" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead><TableHead>Nome</TableHead>
                      <TableHead>Valuta</TableHead><TableHead>Classe</TableHead>
                      <TableHead>Stato</TableHead><TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instruments.map(i => (
                      <TableRow key={i.id} className={i.status === 'archived' ? 'opacity-60' : ''}>
                        <TableCell className="font-mono">{i.ticker}</TableCell>
                        <TableCell>{i.name}</TableCell>
                        <TableCell>{i.currency}</TableCell>
                        <TableCell><Badge variant="outline">{i.regime_class}</Badge></TableCell>
                        <TableCell>
                          {i.status === 'active'
                            ? <Badge className="bg-emerald-600">attivo</Badge>
                            : <Badge variant="secondary">archiviato</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {i.status === 'active' ? (
                            <Button variant="ghost" size="sm" onClick={async () => {
                              try { await archiveInstrument(i.id); toast.success(`${i.ticker} archiviato`); invalidate(); }
                              catch (e) { toast.error(errMsg(e, 'Archiviazione rifiutata')); }
                            }}><Archive className="mr-1 h-4 w-4" />Archivia</Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={async () => {
                              try { await reactivateInstrument(i.id); toast.success(`${i.ticker} riattivato`); invalidate(); }
                              catch (e) { toast.error(errMsg(e, 'Riattivazione rifiutata')); }
                            }}><RotateCcw className="mr-1 h-4 w-4" />Riattiva</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                La cancellazione fisica è vietata: uno strumento con storico si archivia (resta vendibile, non acquistabile).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices" className="space-y-4">
          <PricePanel active={active} latest={latestByInstrument} stale={stale} onDone={invalidate} />
        </TabsContent>

        <TabsContent value="fx" className="space-y-4">
          <FxPanel portfolioId={portfolioId} defaultFx={defaultFx} onDone={() => qc.invalidateQueries({ queryKey: ['portfolio-state'] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewInstrumentDialog({ portfolioId, onDone }: { portfolioId: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: '', ticker: '', currency: 'EUR' as CurrencyCode, instrument_type: 'ETF' as InstrumentType,
    regime_class: 'BOTH' as RegimeClass, sleeve: 'CORE' as Sleeve, isin: '',
  });
  const valid = f.name.trim() && f.ticker.trim();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Nuovo strumento</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuovo strumento</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Ticker"><Input value={f.ticker} onChange={e => setF({ ...f, ticker: e.target.value })} /></Field>
          <Field label="Valuta"><Picker value={f.currency} onChange={v => setF({ ...f, currency: v as CurrencyCode })} options={CURRENCIES} /></Field>
          <Field label="Tipo"><Picker value={f.instrument_type} onChange={v => setF({ ...f, instrument_type: v as InstrumentType })} options={TYPES} /></Field>
          <Field label="Classe regime"><Picker value={f.regime_class} onChange={v => setF({ ...f, regime_class: v as RegimeClass })} options={CLASSES} /></Field>
          <Field label="Sleeve"><Picker value={f.sleeve} onChange={v => setF({ ...f, sleeve: v as Sleeve })} options={SLEEVES} /></Field>
          <Field label="ISIN (opz.)"><Input value={f.isin} onChange={e => setF({ ...f, isin: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button disabled={!valid || !portfolioId} onClick={async () => {
            try {
              await createInstrument(portfolioId!, { ...f, isin: f.isin || null });
              toast.success('Strumento creato'); setOpen(false); onDone();
              setF({ ...f, name: '', ticker: '', isin: '' });
            } catch (e) { toast.error(errMsg(e, 'Creazione rifiutata')); }
          }}>Crea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricePanel({ active, latest, stale, onDone }: {
  active: InstrumentFull[];
  latest: Map<string, { date: string; price: string; source: string }>;
  stale: number; onDone: () => void;
}) {
  const [sel, setSel] = useState<string>('');
  const [date, setDate] = useState(todayIso());
  const [price, setPrice] = useState('');
  const [csv, setCsv] = useState('');
  const today = todayIso();
  const selInst = active.find(i => i.id === sel);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Inserisci prezzo (valuta nativa)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Strumento">
            <Picker value={sel} onChange={setSel} options={active.map(i => i.id)} labels={Object.fromEntries(active.map(i => [i.id, `${i.ticker} (${i.currency})`]))} placeholder="Seleziona…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} /></Field>
            <Field label={`Prezzo ${selInst ? selInst.currency : ''}`}><Input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></Field>
          </div>
          <Button disabled={!sel || !price || !date} onClick={async () => {
            try {
              await upsertPrices(sel, [{ price_date: date, close_price: price.replace(',', '.') }], 'manual');
              toast.success('Prezzo registrato'); setPrice(''); onDone();
            } catch (e) { toast.error(errMsg(e, 'Prezzo rifiutato')); }
          }}>Salva prezzo</Button>

          <div className="border-t pt-3">
            <Label className="text-sm">Import CSV (righe "data;prezzo")</Label>
            <Textarea className="mt-1 font-mono text-xs" rows={5} placeholder={'2026-05-31;101.20\n2026-06-30;103.40'} value={csv} onChange={e => setCsv(e.target.value)} />
            <Button className="mt-2" variant="secondary" disabled={!sel || !csv.trim()} onClick={async () => {
              const { rows, errors } = parsePriceCsv(csv);
              if (errors.length) { toast.error(`${errors.length} riga/e non valida/e: ${errors[0]}`); return; }
              try {
                await upsertPrices(sel, rows, 'csv');
                toast.success(`${rows.length} prezzi importati`); setCsv(''); onDone();
              } catch (e) { toast.error(errMsg(e, 'Import rifiutato')); }
            }}><Upload className="mr-1 h-4 w-4" />Importa CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ultimo prezzo per strumento</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Ticker</TableHead><TableHead>Ultima data</TableHead><TableHead className="text-right">Prezzo</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {active.map(i => {
                const l = latest.get(i.id);
                const isStale = l ? daysBetween(today, l.date) > stale : false;
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono">{i.ticker}</TableCell>
                    <TableCell>{l?.date ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono">{l ? `${l.price} ${i.currency}` : 'n/d'}</TableCell>
                    <TableCell>{isStale && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />stantio</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FxPanel({ portfolioId, defaultFx, onDone }: { portfolioId: string | null; defaultFx: Record<string, number>; onDone: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(['USD', 'CHF'] as const).map(ccy => (
        <FxCard key={ccy} portfolioId={portfolioId} currency={ccy} proposal={defaultFx[ccy]} onDone={onDone} />
      ))}
    </div>
  );
}

function FxCard({ portfolioId, currency, proposal, onDone }: {
  portfolioId: string | null; currency: 'USD' | 'CHF'; proposal?: number; onDone: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [rate, setRate] = useState('');
  return (
    <Card>
      <CardHeader><CardTitle>Cambio {currency} → EUR</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Convenzione: EUR per 1 {currency}. Il default {proposal !== undefined ? `(${proposal})` : ''} è solo una proposta; ogni valuta va confermata singolarmente.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="EUR/1 unità"><Input inputMode="decimal" placeholder={proposal !== undefined ? String(proposal) : ''} value={rate} onChange={e => setRate(e.target.value)} /></Field>
        </div>
        <Button disabled={!rate || !portfolioId} onClick={async () => {
          try {
            await confirmFx(portfolioId!, currency, date, rate.replace(',', '.'));
            toast.success(`Cambio ${currency} confermato`); setRate(''); onDone();
          } catch (e) { toast.error(errMsg(e, 'Cambio rifiutato')); }
        }}>Conferma {currency}</Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Picker({ value, onChange, options, labels, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[];
  labels?: Record<string, string>; placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder ?? 'Seleziona'} /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
