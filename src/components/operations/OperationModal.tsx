import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatEur } from '@/lib/formatEur';
import { usePortfolioState } from '@/hooks/usePortfolioState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { D, ZERO, Decimal } from '@/domain/decimal';
import type { OperationPrefill } from '@/contexts/operationModalStore';
import {
  previewOperation,
  proposeFx,
  type OpKind,
  type FxProposal,
} from '@/domain/operationPreview';
import {
  registerBuy,
  registerSell,
  registerDividend,
  registerCashOp,
  newIdempotencyKey,
} from '@/services/operations';

const KINDS: { value: OpKind; label: string }[] = [
  { value: 'BUY', label: 'Acquisto (BUY)' },
  { value: 'SELL', label: 'Vendita (SELL)' },
  { value: 'DIVIDEND', label: 'Dividendo' },
  { value: 'DEPOSIT', label: 'Versamento' },
  { value: 'WITHDRAW', label: 'Prelievo' },
  { value: 'FEE', label: 'Commissione' },
  { value: 'OTHER_INCOME', label: 'Altro provento' },
];

const today = (): string => new Date().toISOString().slice(0, 10);

const fmtEur = formatEur; // helper condiviso (F6-r2.1)

export interface OperationModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: OperationPrefill;
}

export function OperationModal({ open, onOpenChange, prefill }: OperationModalProps) {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const { state, data: inputs } = usePortfolioState(user?.id ?? null);

  const { data: pfSettings } = useQuery({
    queryKey: ['portfolio-settings-fx', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data: pf } = await supabase.from('portfolios').select('id').eq('user_id', user!.id).maybeSingle();
      if (!pf) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('portfolio_settings').select('default_fx').eq('portfolio_id', pf.id).maybeSingle();
      return (data?.default_fx ?? null) as Record<string, string | number> | null;
    },
  });

  const { data: instrumentsWithStatus } = useQuery({
    queryKey: ['instruments-with-status', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data: pf } = await supabase.from('portfolios').select('id').eq('user_id', user!.id).maybeSingle();
      if (!pf) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('instruments_v')
        .select('id,ticker,name,currency,quantity_step,status')
        .eq('portfolio_id', pf.id);
      return (data ?? []) as Array<{
        id: string; ticker: string; name: string; currency: 'EUR'|'USD'|'CHF';
        quantity_step: string; status: 'active' | 'archived';
      }>;
    },
  });

  const [kind, setKind] = useState<OpKind>('BUY');
  const [instrumentId, setInstrumentId] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(today());
  const [quantity, setQuantity] = useState<string>('');
  const [priceCcy, setPriceCcy] = useState<string>('');
  const [feesEur, setFeesEur] = useState<string>('');
  const [grossAmountEur, setGrossAmountEur] = useState<string>('');
  const [fxInput, setFxInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const idemRef = useRef<string>('');

  useEffect(() => {
    if (!open) return;
    idemRef.current = newIdempotencyKey();
    setErrorMsg(null);
    setBusy(false);
    setKind(prefill?.kind ?? 'BUY');
    setInstrumentId(prefill?.instrumentId ?? '');
    setEffectiveDate(today());
    setQuantity(prefill?.quantity ?? '');
    setPriceCcy(prefill?.priceCcy ?? '');
    setFeesEur('');
    setGrossAmountEur(prefill?.grossAmountEur ?? '');
    setFxInput('');
    setNotes(prefill?.notes ?? '');
  }, [open, prefill]);

  const selectedInstr = useMemo(
    () => instrumentsWithStatus?.find((i) => i.id === instrumentId) ?? null,
    [instrumentsWithStatus, instrumentId],
  );

  const requiresInstrument = kind === 'BUY' || kind === 'SELL' || kind === 'DIVIDEND';
  const requiresQuantityPrice = kind === 'BUY' || kind === 'SELL';
  const requiresGross = kind === 'DEPOSIT' || kind === 'WITHDRAW' || kind === 'FEE' || kind === 'DIVIDEND' || kind === 'OTHER_INCOME';

  const positionsById = useMemo(() => {
    const m = new Map<string, { qty: string; avgCost: string }>();
    (state?.valuations ?? []).forEach((v) => {
      m.set(v.instrumentId, { qty: v.quantity.toString(), avgCost: v.averageCostEur.toString() });
    });
    return m;
  }, [state]);

  const filteredInstruments = useMemo(() => {
    if (!instrumentsWithStatus) return [];
    if (kind === 'BUY') return instrumentsWithStatus.filter((i) => i.status === 'active');
    if (kind === 'SELL') return instrumentsWithStatus.filter((i) => {
      const p = positionsById.get(i.id);
      return p && D(p.qty).gt(0);
    });
    if (kind === 'DIVIDEND') return instrumentsWithStatus;
    return [];
  }, [instrumentsWithStatus, kind, positionsById]);

  const fxProposal: FxProposal = useMemo(() => {
    if (!selectedInstr || !inputs) {
      return { fx: ZERO, fxAsString: '', source: 'none', date: null, currency: (selectedInstr?.currency ?? 'EUR') };
    }
    const df: Record<string, string> | null = pfSettings
      ? Object.fromEntries(Object.entries(pfSettings).map(([k, v]) => [k, String(v)]))
      : null;
    return proposeFx(inputs.fxRates, selectedInstr.currency, effectiveDate, df);
  }, [selectedInstr, inputs, pfSettings, effectiveDate]);

  const lastProposalKey = useRef<string>('');
  useEffect(() => {
    const key = `${selectedInstr?.id ?? ''}|${effectiveDate}|${fxProposal.source}|${fxProposal.fxAsString}`;
    if (key !== lastProposalKey.current) {
      lastProposalKey.current = key;
      if (fxProposal.source !== 'none') setFxInput(fxProposal.fxAsString);
      else setFxInput('');
    }
  }, [fxProposal, selectedInstr?.id, effectiveDate]);

  const pos = selectedInstr ? positionsById.get(selectedInstr.id) : undefined;
  const cashBefore = state?.cash.cashEur ?? ZERO;
  const qtyBefore = pos ? D(pos.qty) : ZERO;
  const avgCost = pos ? D(pos.avgCost) : ZERO;
  const requiresFx = !!selectedInstr && selectedInstr.currency !== 'EUR';

  const preview = useMemo(() => previewOperation({
    kind,
    cashBeforeEur: cashBefore,
    positionQtyBefore: qtyBefore,
    positionAvgCostEur: avgCost,
    quantity: requiresQuantityPrice ? quantity : undefined,
    priceCcy: requiresQuantityPrice ? priceCcy : undefined,
    fxEurPerUnit: requiresQuantityPrice ? (selectedInstr?.currency === 'EUR' ? '1' : fxInput) : undefined,
    feesEur,
    grossAmountEur: requiresGross ? grossAmountEur : undefined,
    quantityStep: selectedInstr ? D(selectedInstr.quantity_step) : ZERO,
    currency: selectedInstr?.currency ?? 'EUR',
    requiresFx,
    hasFxProposal: fxProposal.source !== 'none',
  }), [
    kind, cashBefore, qtyBefore, avgCost, quantity, priceCcy, fxInput, feesEur,
    grossAmountEur, selectedInstr, requiresFx, fxProposal.source,
    requiresQuantityPrice, requiresGross,
  ]);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (requiresInstrument && !instrumentId) return false;
    if (!effectiveDate) return false;
    if (requiresQuantityPrice) {
      if (!quantity || D(quantity).lte(0)) return false;
      if (!priceCcy || D(priceCcy).lte(0)) return false;
      if (requiresFx && (!fxInput || D(fxInput).lte(0))) return false;
    }
    if (requiresGross) {
      if (!grossAmountEur || D(grossAmountEur).lte(0)) return false;
    }
    return true;
  }, [busy, requiresInstrument, instrumentId, effectiveDate, requiresQuantityPrice, quantity, priceCcy, requiresFx, fxInput, requiresGross, grossAmountEur]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMsg(null);
    const key = idemRef.current;
    try {
      let res;
      if (kind === 'BUY') {
        res = await registerBuy(key, {
          instrument_id: instrumentId, quantity, price_ccy: priceCcy,
          fx_eur_per_unit: requiresFx ? fxInput : undefined,
          fees_eur: feesEur || undefined,
          effective_date: effectiveDate, notes: notes || undefined,
        });
      } else if (kind === 'SELL') {
        res = await registerSell(key, {
          instrument_id: instrumentId, quantity, price_ccy: priceCcy,
          fx_eur_per_unit: requiresFx ? fxInput : undefined,
          fees_eur: feesEur || undefined,
          effective_date: effectiveDate, notes: notes || undefined,
        });
      } else if (kind === 'DIVIDEND') {
        res = await registerDividend(key, {
          instrument_id: instrumentId, gross_amount_eur: grossAmountEur,
          effective_date: effectiveDate, notes: notes || undefined,
        });
      } else {
        res = await registerCashOp(key, kind, {
          gross_amount_eur: grossAmountEur,
          effective_date: effectiveDate, notes: notes || undefined,
        });
      }
      toast.success('Operazione registrata', {
        description: `Gross autoritativo: €${res.gross_amount_eur}`,
      });
      await qc.invalidateQueries({ queryKey: ['portfolio-state'] });
      prefill?.onSuccess?.();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova operazione</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OpKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {requiresInstrument && (
            <div className="space-y-2">
              <Label>Strumento</Label>
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger><SelectValue placeholder="Seleziona strumento" /></SelectTrigger>
                <SelectContent>
                  {filteredInstruments.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.ticker} — {i.name} ({i.currency}){i.status === 'archived' ? ' • Archiviato' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedInstr && (
                <div className="text-xs text-muted-foreground">
                  Valuta: <Badge variant="outline">{selectedInstr.currency}</Badge> (non modificabile)
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Data effettiva</Label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>

          {requiresQuantityPrice && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantità</Label>
                <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Prezzo unitario ({selectedInstr?.currency ?? '—'})</Label>
                <Input inputMode="decimal" value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          )}

          {requiresQuantityPrice && requiresFx && (
            <div className="space-y-2">
              <Label>FX EUR per 1 {selectedInstr?.currency}</Label>
              <Input inputMode="decimal" value={fxInput} onChange={(e) => setFxInput(e.target.value)} placeholder="es. 0.9259" />
              <div className="text-xs text-muted-foreground">
                {fxProposal.source === 'historical' && (
                  <>Proposta: 1 {selectedInstr!.currency} = {fxProposal.fxAsString} EUR (fx storico del {fxProposal.date}). Modificabile.</>
                )}
                {fxProposal.source === 'default_fx' && (
                  <><strong>Nessun fx storico</strong> ≤ {effectiveDate}. Proposta di default: 1 {selectedInstr!.currency} = {fxProposal.fxAsString} EUR. Conferma o correggi.</>
                )}
                {fxProposal.source === 'none' && (
                  <><strong>FX non disponibile</strong>: inserisci un cambio.</>
                )}
              </div>
            </div>
          )}

          {requiresQuantityPrice && (
            <div className="space-y-2">
              <Label>Commissioni (EUR)</Label>
              <Input inputMode="decimal" value={feesEur} onChange={(e) => setFeesEur(e.target.value)} placeholder="0.00" />
            </div>
          )}

          {requiresGross && (
            <div className="space-y-2">
              <Label>Importo (EUR){kind === 'DIVIDEND' ? ' netto accreditato' : ''}</Label>
              <Input inputMode="decimal" value={grossAmountEur} onChange={(e) => setGrossAmountEur(e.target.value)} placeholder="0.00" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Note</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opzionale" />
          </div>

          <div className="rounded-md border p-3 space-y-1 bg-muted/40 text-sm">
            <div className="font-medium mb-1">Anteprima (stimata; il valore autoritativo arriva dal server)</div>
            <div>Cash prima: <span className="font-mono">{fmtEur(cashBefore)}</span> → dopo: <span className="font-mono">{fmtEur(preview.cashAfterEur)}</span></div>
            {requiresInstrument && selectedInstr && (
              <div>Quantità prima: <span className="font-mono">{qtyBefore.toString()}</span> → dopo: <span className="font-mono">{preview.positionQtyAfter.toString()}</span></div>
            )}
            <div>Controvalore EUR stimato: <span className="font-mono">{fmtEur(preview.estimatedGrossEur)}</span></div>
            {(kind === 'BUY' || kind === 'SELL') && (
              <div>Commissioni: <span className="font-mono">{fmtEur(preview.feesEur)}</span></div>
            )}
            {preview.realizedPnlEur && (
              <div>P/L realizzato stimato: <span className={`font-mono ${preview.realizedPnlEur.gte(0) ? 'text-green-600' : 'text-red-600'}`}>{fmtEur(preview.realizedPnlEur)}</span></div>
            )}
          </div>

          {preview.warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription><pre className="whitespace-pre-wrap text-xs">{errorMsg}</pre></AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Annulla</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {busy ? 'Registrazione…' : 'Conferma operazione'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}