import { D, Decimal, ZERO } from './decimal';
import { replayLedger } from './ledgerReplay';
import { projectPositions } from './positions';
import { valuePositions } from './pnl';
import type { LedgerRow, InstrumentRow, PriceRow, FxRow } from './types';

/* =========================================================================
 * F4 — Motore performance (dominio puro).
 * Convenzione Modified Dietz approvata dal master:
 *   R = (VF − VI − ΣCF) / (VI + Σ(CF × w)),  w = (T − di) / T
 * Flussi esterni = SOLO DEPOSIT (+) e WITHDRAW (−), intervallo (t0, t1],
 * convenzione fine giornata, stessa data aggregata. OPENING_* e BUY/SELL/
 * DIVIDEND/OTHER_INCOME/FEE non sono flussi esterni. REVERSAL neutralizzata
 * dal replay canonico. Decimal a precisione piena; arrotondamenti SOLO in UI.
 * ========================================================================= */

export interface PerformanceInputs {
  operations: LedgerRow[];
  instruments: InstrumentRow[];
  prices: PriceRow[];
  fxRates: FxRow[];
  trackingStartedOn: string | null; // YYYY-MM-DD
  asOf: string;                      // YYYY-MM-DD (ultima data di valorizzazione richiesta)
  /** Soglia "prezzo stantio" in giorni di calendario (da portfolio_settings.stale_price_days). */
  stalePriceDays?: number;
}

const DEFAULT_STALE_DAYS = 45;

export type CellStatus = 'ok' | 'na';

export interface ValuePoint {
  date: string;
  value: Decimal | null;   // valore del portafoglio a chiusura di `date`
  status: CellStatus;      // 'na' = non valorizzabile (interrompe il grafico)
  stale: boolean;          // valore basato su prezzo antecedente al mese del punto
  reason?: string;
}

export interface DietzResult {
  periodStart: string;
  periodEnd: string;
  label: string;
  vi: Decimal | null;
  vf: Decimal | null;
  netFlows: Decimal;       // ΣCF (somma non pesata dei flussi esterni)
  returnPct: Decimal | null;
  status: CellStatus;
  reason?: string;
}

export interface WinRate {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  ratePct: Decimal | null; // wins/total×100, null se total=0
}

export interface PerformanceResult {
  valueSeries: ValuePoint[];
  monthly: DietzResult[];
  sinceInception: DietzResult;
  winRate: WinRate;
  lastValuationDate: string;
}

// ---------- date helpers (calendario, UTC) ----------
const DAY_MS = 86_400_000;
const parseDay = (d: string): number => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};
const daysBetween = (a: string, b: string): number => Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
const fmt = (ms: number): string => {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const monthEndOf = (d: string): string => {
  const [y, m] = d.split('-').map(Number);
  return fmt(Date.UTC(y, m, 0)); // giorno 0 del mese successivo = ultimo giorno di questo mese
};
const nextMonthEnd = (monthEnd: string): string => {
  const [y, m] = monthEnd.split('-').map(Number);
  return fmt(Date.UTC(y, m + 1, 0)); // ultimo giorno del mese successivo
};

// ---------- valorizzazione point-in-time ----------
interface StateAt { value: Decimal | null; stale: boolean; missingCount: number }
function valueAt(inp: PerformanceInputs, asOf: string): StateAt {
  const ops = inp.operations.filter(o => o.effective_date <= asOf);
  const active = replayLedger(ops);
  const { positions, cash: cashState } = projectPositions(active);
  const valuations = valuePositions(positions, inp.prices, inp.instruments, inp.fxRates, asOf);
  const cash = cashState.cashEur;
  let posValue = ZERO;
  let missing = 0;
  let stale = false;
  const staleDays = inp.stalePriceDays ?? DEFAULT_STALE_DAYS;
  for (const v of valuations) {
    if (v.status === 'valued' && v.marketValueEur) {
      posValue = posValue.plus(v.marketValueEur);
      // Stantio SOLO oltre la soglia configurata (confine esclusivo: = soglia → non stantio).
      if (v.lastPriceDate && daysBetween(v.lastPriceDate, asOf) > staleDays) stale = true;
    } else if (v.quantity.gt(0)) {
      missing += 1;
    }
  }
  if (missing > 0) return { value: null, stale: false, missingCount: missing };
  return { value: cash.plus(posValue), stale, missingCount: 0 };
}

// ---------- flussi esterni ----------
interface Flow { date: string; amount: Decimal }
function externalFlows(inp: PerformanceInputs): Flow[] {
  const active = replayLedger(inp.operations.filter(o => o.effective_date <= inp.asOf));
  const flows: Flow[] = [];
  for (const o of active) {
    if (o.op_type === 'DEPOSIT') flows.push({ date: o.effective_date, amount: D(o.gross_amount_eur) });
    else if (o.op_type === 'WITHDRAW') flows.push({ date: o.effective_date, amount: D(o.gross_amount_eur).negated() });
  }
  return flows;
}
/** Flussi in (t0, t1], aggregati per data. */
function flowsInPeriod(all: Flow[], t0: string, t1: string): Flow[] {
  const byDate = new Map<string, Decimal>();
  for (const f of all) {
    if (f.date > t0 && f.date <= t1) byDate.set(f.date, (byDate.get(f.date) ?? ZERO).plus(f.amount));
  }
  return [...byDate.entries()].map(([date, amount]) => ({ date, amount }));
}

// ---------- Modified Dietz ----------
function modifiedDietz(
  vi: Decimal | null, vf: Decimal | null, flows: Flow[], t0: string, t1: string,
): { netFlows: Decimal; returnPct: Decimal | null; status: CellStatus; reason?: string } {
  const netFlows = flows.reduce((a, f) => a.plus(f.amount), ZERO);
  if (vi === null || vf === null) return { netFlows, returnPct: null, status: 'na', reason: 'valorizzazione mancante' };
  const T = daysBetween(t0, t1);
  if (T <= 0) return { netFlows, returnPct: null, status: 'na', reason: 'periodo nullo (T=0)' };
  let weighted = ZERO;
  for (const f of flows) {
    const di = daysBetween(t0, f.date);
    const w = new Decimal(T - di).div(T); // giorni di calendario: interi esatti
    weighted = weighted.plus(f.amount.times(w));
  }
  const denom = vi.plus(weighted);
  if (denom.lte(0)) return { netFlows, returnPct: null, status: 'na', reason: 'denominatore ≤ 0' };
  const R = vf.minus(vi).minus(netFlows).div(denom).times(100);
  return { netFlows, returnPct: R, status: 'ok' };
}

const monthLabel = (monthEnd: string): string => monthEnd.slice(0, 7);

// ---------- entrypoint ----------
export function computePerformance(inp: PerformanceInputs): PerformanceResult {
  const asOf = inp.asOf;
  const t0 = inp.trackingStartedOn;
  const allFlows = externalFlows(inp);

  // Nessun tracking avviato → risultato vuoto ma ben tipizzato.
  if (!t0) {
    return {
      valueSeries: [],
      monthly: [],
      sinceInception: { periodStart: null as unknown as string, periodEnd: asOf, label: 'Dal primo monitoraggio', vi: null, vf: null, netFlows: ZERO, returnPct: null, status: 'na', reason: 'monitoraggio non avviato' },
      winRate: winRateOf(inp),
      lastValuationDate: asOf,
    };
  }

  // Confini mensili: primo month-end STRETTAMENTE > t0 (mai il periodo nullo t0→t0:
  // se il tracking parte a fine mese, il primo periodo chiude alla fine del mese
  // successivo), poi mensili, fino a ≤ asOf. Ogni periodo ha periodEnd > periodStart.
  const monthEnds: string[] = [];
  let e = monthEndOf(t0);
  if (e <= t0) e = nextMonthEnd(e);
  while (e <= asOf) { monthEnds.push(e); e = nextMonthEnd(e); }

  // Curva del valore: t0, ogni month-end concluso, e l'eventuale punto finale ad
  // asOf — date UNICHE e ordinate (t0 non è mai duplicato: i monthEnds sono > t0).
  const curveDates: string[] = [t0, ...monthEnds];
  if ((monthEnds.length === 0 || monthEnds[monthEnds.length - 1] < asOf) && asOf !== t0) {
    curveDates.push(asOf);
  }
  const valueSeries: ValuePoint[] = curveDates.map(date => {
    const s = valueAt(inp, date);
    return s.value === null
      ? { date, value: null, status: 'na', stale: false, reason: `${s.missingCount} strumento/i senza valorizzazione` }
      : { date, value: s.value, status: 'ok', stale: s.stale };
  });

  // Rendimenti mensili Modified Dietz (ogni mese indipendente; nessun concatenamento).
  const monthly: DietzResult[] = [];
  let prev = t0;
  for (const me of monthEnds) {
    const vi = valueAt(inp, prev).value;
    const vf = valueAt(inp, me).value;
    const flows = flowsInPeriod(allFlows, prev, me);
    const md = modifiedDietz(vi, vf, flows, prev, me);
    monthly.push({ periodStart: prev, periodEnd: me, label: monthLabel(me), vi, vf, netFlows: md.netFlows, returnPct: md.returnPct, status: md.status, reason: md.reason });
    prev = me;
  }

  // Since-inception: calcolo diretto t0 → asOf (NON concatenamento dei mensili).
  const viSI = valueAt(inp, t0).value;
  const vfSI = valueAt(inp, asOf).value;
  const flowsSI = flowsInPeriod(allFlows, t0, asOf);
  const mdSI = modifiedDietz(viSI, vfSI, flowsSI, t0, asOf);
  const sinceInception: DietzResult = {
    periodStart: t0, periodEnd: asOf, label: 'Dal primo monitoraggio',
    vi: viSI, vf: vfSI, netFlows: mdSI.netFlows, returnPct: mdSI.returnPct, status: mdSI.status, reason: mdSI.reason,
  };

  return { valueSeries, monthly, sinceInception, winRate: winRateOf(inp), lastValuationDate: asOf };
}

// ---------- win-rate (per singola SELL, dal replay canonico) ----------
function winRateOf(inp: PerformanceInputs): WinRate {
  const active = replayLedger(inp.operations.filter(o => o.effective_date <= inp.asOf));
  const { sellEffects } = projectPositions(active);
  let wins = 0, losses = 0, breakeven = 0;
  for (const s of sellEffects) {
    if (s.realizedPnlEur.gt(0)) wins += 1;
    else if (s.realizedPnlEur.lt(0)) losses += 1;
    else breakeven += 1;
  }
  const total = sellEffects.length;
  const ratePct = total === 0 ? null : new Decimal(wins).div(total).times(100); // conteggi interi
  return { total, wins, losses, breakeven, ratePct };
}
