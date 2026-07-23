import { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePortfolioMeta, useInstruments, useTargets, type InstrumentFull, type TargetSetRow } from '@/hooks/usePortfolioMeta';
import { saveTargetSet, type TargetRegime } from '@/services/targets';

interface EditRow { key: string; instrument_id: string | null; weight: string; }
const CASH_KEY = '__cash__';
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Canonical, order-independent signature of a composition (for dirty-check + key).
function canonicalOf(rows: { instrument_id: string | null; weight: number }[]): string {
  return rows.map(r => `${r.instrument_id ?? ''}:${round4(r.weight)}`).sort().join('|');
}
// Small deterministic hash (djb2) — keeps the idempotency key compact.
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function isCompatible(i: InstrumentFull, regime: TargetRegime): boolean {
  if (i.status !== 'active') return false;
  if (i.regime_class === 'BOTH') return true;
  return regime === 'RISK_ON' ? i.regime_class === 'AGGRESSIVE' : i.regime_class === 'DEFENSIVE';
}

export function TargetEditor({ regime }: { regime: TargetRegime }) {
  const { user } = useCurrentUser();
  const meta = usePortfolioMeta(user?.id ?? null);
  const portfolioId = meta.data?.portfolioId ?? null;
  const instQ = useInstruments(portfolioId);
  const tgtQ = useTargets(portfolioId);
  const qc = useQueryClient();

  const instruments = useMemo(() => instQ.data ?? [], [instQ.data]);
  const compatible = useMemo(() => instruments.filter(i => isCompatible(i, regime)), [instruments, regime]);
  const nameOf = (id: string | null) => id === null ? 'Cash (liquidità)' : (instruments.find(i => i.id === id)?.ticker ?? id);

  const setsForRegime = (tgtQ.data?.sets ?? []).filter(s => s.regime === regime);
  const activeSet = setsForRegime.find(s => s.status === 'active');
  const draftSet = setsForRegime.find(s => s.status === 'draft');
  const baseSet: TargetSetRow | undefined = activeSet ?? draftSet;

  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Prefill once from the current active (or seed draft) set.
  useEffect(() => {
    if (!tgtQ.data) return;
    const signature = `${regime}:${baseSet?.id ?? 'none'}`;
    if (loadedFor === signature) return;
    const allocs = baseSet ? (tgtQ.data.allocs.filter(a => a.target_set_id === baseSet.id)) : [];
    const seeded: EditRow[] = allocs.map((a, idx) => ({
      key: a.instrument_id ?? CASH_KEY + idx,
      instrument_id: a.instrument_id,
      weight: String(a.weight),
    }));
    if (!seeded.some(r => r.instrument_id === null)) seeded.push({ key: CASH_KEY, instrument_id: null, weight: '0' });
    setRows(seeded);
    setLoadedFor(signature);
  }, [tgtQ.data, baseSet, regime, loadedFor]);

  const usedIds = new Set(rows.map(r => r.instrument_id).filter(Boolean) as string[]);
  const addable = compatible.filter(i => !usedIds.has(i.id));

  const sum = round4(rows.reduce((acc, r) => acc + (Number(r.weight) || 0), 0));
  const hasCash = rows.filter(r => r.instrument_id === null).length === 1;
  const incompatible = rows.filter(r => r.instrument_id !== null && !compatible.some(i => i.id === r.instrument_id));
  const anyNaN = rows.some(r => r.weight.trim() === '' || !Number.isFinite(Number(r.weight)) || Number(r.weight) < 0);
  const sumOk = Math.abs(sum - 100) < 0.00005;

  // Firma canonica della composizione corrente e di quella ATTIVA.
  const currentCanonical = canonicalOf(rows.map(r => ({ instrument_id: r.instrument_id, weight: Number(r.weight) || 0 })));
  const activeCanonical = useMemo(() => {
    if (!activeSet || !tgtQ.data) return null; // nessuna versione attiva → sempre "dirty" (serve confermare)
    const a = tgtQ.data.allocs
      .filter(x => x.target_set_id === activeSet.id)
      .map(x => ({ instrument_id: x.instrument_id, weight: Number(x.weight) }));
    return canonicalOf(a);
  }, [activeSet, tgtQ.data]);
  // "dirty" = diverso dalla versione attiva. Se non esiste un'attiva (solo bozza seed), è dirty.
  const isDirty = activeCanonical === null ? true : currentCanonical !== activeCanonical;

  const canSave = sumOk && hasCash && incompatible.length === 0 && !anyNaN && !saving && !!portfolioId && isDirty;

  const setWeight = (key: string, w: string) => setRows(rs => rs.map(r => r.key === key ? { ...r, weight: w } : r));
  const removeRow = (key: string) => setRows(rs => rs.filter(r => r.key !== key));
  const addRow = (instrumentId: string) => setRows(rs => [...rs, { key: instrumentId, instrument_id: instrumentId, weight: '0' }]);

  async function onSave() {
    setSaving(true);
    try {
      const payloadRows = rows.map(r => ({ instrument_id: r.instrument_id, weight: round4(Number(r.weight)) }));
      // Chiave STABILE per contenuto + versione-base: un doppio click / retry della
      // stessa modifica resta idempotente (nessuna versione duplicata); una modifica
      // diversa, o una nuova modifica dopo che l'attiva è cambiata, ottiene una chiave nuova.
      const key = `tgt:${regime}:b${activeSet?.version ?? 0}:${djb2(currentCanonical)}`;
      const res = await saveTargetSet(key, regime, payloadRows);
      toast.success(`Target ${regime} salvato — versione ${res.version} attiva`);
      qc.invalidateQueries({ queryKey: ['targets'] });
      qc.invalidateQueries({ queryKey: ['portfolio-state'] });
      setLoadedFor(null); // reload from the new active
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Salvataggio rifiutato');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {baseSet && baseSet.status === 'draft' && (
        <Alert>
          <AlertDescription>
            Stai confermando la <strong>bozza seed</strong> (v{baseSet.version}). Al salvataggio diventa la versione attiva.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Composizione {regime === 'RISK_ON' ? 'Risk-On' : 'Risk-Off'}</span>
            <Badge variant={sumOk ? 'default' : 'destructive'} className={sumOk ? 'bg-emerald-600' : ''}>
              Σ {sum.toFixed(4)} / 100
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Strumento</TableHead><TableHead>Classe</TableHead><TableHead className="w-40 text-right">Peso %</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const inst = r.instrument_id ? instruments.find(i => i.id === r.instrument_id) : null;
                const bad = r.instrument_id !== null && !compatible.some(i => i.id === r.instrument_id);
                return (
                  <TableRow key={r.key} className={bad ? 'bg-destructive/10' : ''}>
                    <TableCell className="font-medium">{nameOf(r.instrument_id)}</TableCell>
                    <TableCell>{inst ? <Badge variant="outline">{inst.regime_class}</Badge> : <Badge variant="secondary">Cash</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Input className="ml-auto w-28 text-right font-mono" inputMode="decimal" value={r.weight}
                        onChange={e => setWeight(r.key, e.target.value)} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.instrument_id !== null && (
                        <Button variant="ghost" size="icon" onClick={() => removeRow(r.key)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {addable.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value="" onValueChange={addRow}>
                <SelectTrigger className="w-72"><SelectValue placeholder="Aggiungi strumento compatibile…" /></SelectTrigger>
                <SelectContent>
                  {addable.map(i => <SelectItem key={i.id} value={i.id}>{i.ticker} — {i.name} ({i.regime_class})</SelectItem>)}
                </SelectContent>
              </Select>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
          )}

          {!sumOk && <p className="text-sm text-destructive">La somma dei pesi deve essere esattamente 100 (scarto {(100 - sum).toFixed(4)}).</p>}
          {!hasCash && <p className="text-sm text-destructive">È obbligatoria esattamente una riga Cash.</p>}
          {incompatible.length > 0 && <p className="text-sm text-destructive">Righe incompatibili col regime: {incompatible.map(r => nameOf(r.instrument_id)).join(', ')}.</p>}
          {!isDirty && sumOk && hasCash && <p className="text-sm text-muted-foreground">Nessuna modifica rispetto alla versione attiva: non verrà creata una nuova versione.</p>}

          <div className="flex justify-end">
            <Button disabled={!canSave} onClick={onSave}><Save className="mr-1 h-4 w-4" />Salva versione</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Storico versioni (sola lettura)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Versione</TableHead><TableHead>Stato</TableHead><TableHead>Valida dal</TableHead></TableRow></TableHeader>
            <TableBody>
              {setsForRegime.map(s => (
                <TableRow key={s.id}>
                  <TableCell>v{s.version}</TableCell>
                  <TableCell>
                    {s.status === 'active' ? <Badge className="bg-emerald-600">attiva</Badge>
                      : s.status === 'draft' ? <Badge variant="secondary">bozza</Badge>
                      : <Badge variant="outline">superata</Badge>}
                  </TableCell>
                  <TableCell className="font-mono">{s.effective_from}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
