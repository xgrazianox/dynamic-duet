import { Decimal, ZERO } from './decimal';
import { latestPriceFor, latestFxFor, type PositionValuation } from './pnl';
import { isStalePrice } from './staleness';
import type { PriceRow, FxRow, CurrencyCode } from './types';
import type { RegimeValue } from './regimeState';

/* =========================================================================
 * F5 — Piano di ribilanciamento (sez. 7 del mandato). PURAMENTE PROPOSITIVO.
 * Universo: posseduti ∪ target ∪ cash. Tutta la matematica in Decimal.
 * ========================================================================= */

export interface RebalanceInstrument {
  id: string;
  ticker: string;
  currency: CurrencyCode;
  status: 'active' | 'archived';
  quantityStep: string; // decimale come stringa
}
export interface TargetRowInput { instrumentId: string | null; weightPct: Decimal; } // null = cash
export interface RebalanceSettings {
  tolerancePp: Decimal;
  roundingEur: Decimal;
  minTradeEur: Decimal;
  simulatedFeeEur: Decimal;
  stalePriceDays: number;
}
export interface RebalanceInputs {
  valuations: PositionValuation[];      // stato corrente (da computePortfolioState)
  cashEur: Decimal;
  instruments: RebalanceInstrument[];
  prices: PriceRow[];
  fxRates: FxRow[];
  targetRows: TargetRowInput[] | null;  // target ACTIVE del regime applicabile
  applicableRegime: RegimeValue | null;
  settings: RebalanceSettings;
  asOf: string;
}

export type PlanAction = 'BUY' | 'SELL';
export interface PlanRow {
  instrumentId: string | null;  // null = cash (riga sintetica)
  ticker: string;
  currentValueEur: Decimal;
  currentWeightPct: Decimal;
  targetWeightPct: Decimal;
  deltaWeightPp: Decimal;       // current − target
  action: PlanAction | null;
  sellAll: boolean;             // posseduto ma fuori target → vendita totale
  theoreticalEur: Decimal | null;   // importo teorico arrotondato a rounding_eur
  quantity: Decimal | null;         // quantità eseguibile
  estimatedEur: Decimal | null;     // controvalore stimato dalla quantità
  feeEur: Decimal | null;           // commissione simulata (solo proposte attive)
  residualDeviationPp: Decimal | null;
  priceNative: Decimal | null;      // per il prefill del modale
  suppressed: boolean;
  suppressReason: string | null;
  blockedReason: string | null;     // es. BUY su archiviato
  stale: boolean;
}
export interface CashShortfall {
  availableEur: Decimal;   // cash dopo le vendite
  requiredEur: Decimal;    // fabbisogno acquisti pre-riduzione (importi + commissioni)
  reductions: string[];    // descrizione di ogni riduzione/soppressione
}
export interface RebalancePlan {
  status: 'ok' | 'blocked';
  blockReasons: string[];
  rows: PlanRow[];
  /** Valore INIZIALE del portafoglio. */
  totalValueEur: Decimal | null;
  /** Valore SIMULATO dopo le commissioni: initial − totalFees. */
  postTradeTotalEur: Decimal | null;
  /** Somma dei valori posizione simulati (invariante: + cashAfter = postTradeTotal). */
  simulatedPositionsValueEur: Decimal | null;
  cashBeforeEur: Decimal;
  /** Cash finale simulato REALE: può essere negativo (mai mascherato). */
  cashAfterEur: Decimal | null;
  totalFeesEur: Decimal;
  /** false se la simulazione produce cash negativo: piano NON eseguibile così com'è. */
  executable: boolean;
  infeasibleReasons: string[];
  cashShortfall: CashShortfall | null;
  staleWarnings: string[];  // ticker con prezzo stantio (warning, non blocco)
}

const HALF_UP = Decimal.ROUND_HALF_UP;
const floorToStep = (qty: Decimal, step: Decimal): Decimal =>
  step.lte(0) ? qty : qty.div(step).toDecimalPlaces(0, Decimal.ROUND_FLOOR).times(step);
const roundToEur = (amount: Decimal, rounding: Decimal): Decimal =>
  rounding.lte(0) ? amount : amount.div(rounding).toDecimalPlaces(0, HALF_UP).times(rounding);

export function computeRebalancePlan(inp: RebalanceInputs): RebalancePlan {
  const s = inp.settings;
  const blockReasons: string[] = [];
  const instById = new Map(inp.instruments.map(i => [i.id, i]));
  const valByInst = new Map(inp.valuations.map(v => [v.instrumentId, v]));

  // --- Precondizioni (sez. 7.1) ---
  if (!inp.applicableRegime) blockReasons.push('nessun regime applicabile (nessuna decisione determinata)');
  if (inp.applicableRegime && !inp.targetRows) blockReasons.push('nessun target ACTIVE per il regime applicabile');

  const targetByInst = new Map<string, Decimal>();
  let cashTargetPct = ZERO;
  for (const t of inp.targetRows ?? []) {
    if (t.instrumentId === null) {
      cashTargetPct = t.weightPct; // la riga cash con peso zero resta valida
    } else if (t.weightPct.gt(0)) {
      targetByInst.set(t.instrumentId, t.weightPct);
    }
    // HOTFIX F5: una riga strumento con peso 0 è ECONOMICAMENTE fuori target:
    // se posseduta → sell-all (come assente); se non posseduta → fuori
    // dall'universo operativo (nessun prezzo/FX richiesto, mai bloccante).
  }

  // Universo strumenti: posseduti (qty>0) ∪ strumenti target
  const owned = inp.valuations.filter(v => v.quantity.gt(0));
  const universeIds = new Set<string>([...owned.map(v => v.instrumentId), ...targetByInst.keys()]);

  // Valorizzazione completa dei posseduti
  for (const v of owned) {
    if (v.status !== 'valued') {
      const t = instById.get(v.instrumentId)?.ticker ?? v.instrumentId.slice(0, 8);
      blockReasons.push(`${t}: ${v.status === 'missing_price' ? 'prezzo mancante' : `cambio ${v.currency} mancante`}`);
    }
  }
  // Prezzo/FX per gli strumenti target NON posseduti (servono per i BUY)
  interface Px { priceNative: Decimal; priceDate: string; fx: Decimal; priceEur: Decimal }
  const pxOf = new Map<string, Px>();
  for (const id of universeIds) {
    const inst = instById.get(id);
    if (!inst) { blockReasons.push(`strumento ${id.slice(0, 8)}… sconosciuto`); continue; }
    const v = valByInst.get(id);
    if (v && v.status === 'valued' && v.lastPriceNative && v.fxEurPerUnit && v.lastPriceDate) {
      pxOf.set(id, { priceNative: v.lastPriceNative, priceDate: v.lastPriceDate, fx: v.fxEurPerUnit, priceEur: v.lastPriceNative.times(v.fxEurPerUnit) });
      continue;
    }
    if (v && v.status !== 'valued') continue; // già segnalato sopra
    const pr = latestPriceFor(inp.prices, id, inp.asOf);
    if (!pr) { blockReasons.push(`${inst.ticker}: prezzo mancante`); continue; }
    const fx = latestFxFor(inp.fxRates, inst.currency, inp.asOf);
    if (!fx) { blockReasons.push(`${inst.ticker}: cambio ${inst.currency} mancante`); continue; }
    pxOf.set(id, { priceNative: pr.price, priceDate: pr.date, fx: fx.fx, priceEur: pr.price.times(fx.fx) });
  }

  // Valore totale
  let totalValue: Decimal | null = null;
  if (blockReasons.length === 0) {
    let posValue = ZERO;
    for (const v of owned) posValue = posValue.plus(v.marketValueEur ?? ZERO);
    totalValue = inp.cashEur.plus(posValue);
    if (totalValue.lte(0)) blockReasons.push('valore totale del portafoglio non positivo');
  }

  if (blockReasons.length > 0) {
    return {
      status: 'blocked', blockReasons, rows: [], totalValueEur: null,
      postTradeTotalEur: null, simulatedPositionsValueEur: null,
      cashBeforeEur: inp.cashEur, cashAfterEur: null, totalFeesEur: ZERO,
      executable: false, infeasibleReasons: [],
      cashShortfall: null, staleWarnings: [],
    };
  }
  const total = totalValue as Decimal;

  // --- Righe (sez. 7.2 / 7.3) ---
  const staleWarnings: string[] = [];
  const rows: PlanRow[] = [];
  const sortedIds = [...universeIds].sort((a, b) => {
    const ta = instById.get(a)?.ticker ?? a, tb = instById.get(b)?.ticker ?? b;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  for (const id of sortedIds) {
    const inst = instById.get(id) as RebalanceInstrument;
    const v = valByInst.get(id);
    const px = pxOf.get(id) as Px;
    const qtyOwned = v?.quantity.gt(0) ? v.quantity : ZERO;
    const curValue = qtyOwned.gt(0) ? (v?.marketValueEur ?? ZERO) : ZERO;
    const curW = curValue.div(total).times(100);
    const inTarget = targetByInst.has(id);
    const tgtW = targetByInst.get(id) ?? ZERO;
    const delta = curW.minus(tgtW);
    const stale = isStalePrice(px.priceDate, inp.asOf, s.stalePriceDays);
    if (stale && (qtyOwned.gt(0) || inTarget)) staleWarnings.push(inst.ticker);
    const step = new Decimal(inst.quantityStep);

    const base: PlanRow = {
      instrumentId: id, ticker: inst.ticker,
      currentValueEur: curValue, currentWeightPct: curW, targetWeightPct: tgtW, deltaWeightPp: delta,
      action: null, sellAll: false, theoreticalEur: null, quantity: null, estimatedEur: null,
      feeEur: null, residualDeviationPp: null, priceNative: px.priceNative,
      suppressed: false, suppressReason: null, blockedReason: null, stale,
    };

    // 1) posseduto ma fuori target → SELL TOTALE (ignora tolleranza/rounding/min)
    if (qtyOwned.gt(0) && !inTarget) {
      rows.push({ ...base, action: 'SELL', sellAll: true, quantity: qtyOwned,
        theoreticalEur: curValue, estimatedEur: qtyOwned.times(px.priceEur), feeEur: s.simulatedFeeEur });
      continue;
    }
    // 3) entro tolleranza → nessuna proposta (bordo = tolleranza NON genera)
    if (delta.abs().lte(s.tolerancePp)) { rows.push(base); continue; }

    const tradeEur = tgtW.minus(curW).div(100).times(total); // >0 BUY, <0 SELL
    const action: PlanAction = tradeEur.gt(0) ? 'BUY' : 'SELL';
    const theoretical = roundToEur(tradeEur.abs(), s.roundingEur);

    // 5) archiviato → mai BUY
    if (action === 'BUY' && inst.status === 'archived') {
      rows.push({ ...base, action, theoreticalEur: theoretical,
        blockedReason: 'il target richiede un BUY su uno strumento archiviato: correggi il target o riattiva lo strumento' });
      continue;
    }
    // 4) sotto soglia minima → soppressa ma dichiarata
    if (theoretical.lt(s.minTradeEur)) {
      rows.push({ ...base, action, theoreticalEur: theoretical, suppressed: true,
        suppressReason: `importo €${theoretical.toFixed(2)} sotto la soglia minima €${s.minTradeEur.toFixed(2)}` });
      continue;
    }
    // Quantità
    let qty = floorToStep(theoretical.div(px.priceEur), step);
    if (action === 'SELL') qty = Decimal.min(qty, qtyOwned);
    if (qty.lte(0)) {
      rows.push({ ...base, action, theoreticalEur: theoretical, suppressed: true,
        suppressReason: 'quantità nulla dopo l\'arrotondamento a quantity_step' });
      continue;
    }
    rows.push({ ...base, action, theoreticalEur: theoretical, quantity: qty,
      estimatedEur: qty.times(px.priceEur), feeEur: s.simulatedFeeEur });
  }

  // --- Simulazione cash (sez. 7.4): vendite → poi acquisti in ordine deterministico ---
  let cash = inp.cashEur;
  let totalFees = ZERO;
  const reductions: string[] = [];
  const sells = rows.filter(r => r.action === 'SELL' && !r.suppressed && !r.blockedReason && r.estimatedEur);
  for (const r of sells) {
    cash = cash.plus(r.estimatedEur as Decimal).minus(r.feeEur as Decimal);
    totalFees = totalFees.plus(r.feeEur as Decimal);
  }
  const cashAfterSells = cash;
  const buys = rows
    .filter(r => r.action === 'BUY' && !r.suppressed && !r.blockedReason && r.estimatedEur)
    .sort((a, b) => {
      const cmp = (b.theoreticalEur as Decimal).comparedTo(a.theoreticalEur as Decimal); // deficit maggiore prima
      return cmp !== 0 ? cmp : (a.ticker < b.ticker ? -1 : 1);
    });
  let requiredEur = ZERO;
  for (const r of buys) requiredEur = requiredEur.plus(r.estimatedEur as Decimal).plus(r.feeEur as Decimal);

  for (const r of buys) {
    const px = pxOf.get(r.instrumentId as string) as Px;
    const step = new Decimal((instById.get(r.instrumentId as string) as RebalanceInstrument).quantityStep);
    let est = r.estimatedEur as Decimal;
    const fee = r.feeEur as Decimal;
    if (est.plus(fee).gt(cash)) {
      // 5) riduci per difetto a quantity_step dentro la capienza (commissione inclusa)
      const affordable = cash.minus(fee);
      const newQty = affordable.gt(0) ? floorToStep(affordable.div(px.priceEur), step) : ZERO;
      const newEst = newQty.times(px.priceEur);
      if (newQty.lte(0) || newEst.lt(s.minTradeEur)) {
        r.suppressed = true; r.quantity = null; r.estimatedEur = null; r.feeEur = null;
        r.suppressReason = 'cash insufficiente: proposta soppressa';
        reductions.push(`${r.ticker}: BUY soppresso (cash insufficiente)`);
        continue;
      }
      reductions.push(`${r.ticker}: BUY ridotto da €${est.toFixed(2)} a €${newEst.toFixed(2)} per capienza cash`);
      r.quantity = newQty; r.estimatedEur = newEst; est = newEst;
    }
    cash = cash.minus(est).minus(fee);
    totalFees = totalFees.plus(fee);
  }
  // HOTFIX F5: NESSUN clamp del cash negativo. Se vendite+commissioni simulate
  // producono cash < 0, il piano è NON ESEGUIBILE e lo dichiara.
  const infeasibleReasons: string[] = [];
  if (cash.lt(0)) {
    infeasibleReasons.push(
      `le commissioni simulate superano i ricavi delle vendite: cash finale simulato €${cash.toFixed(2)} — piano non eseguibile così com'è`,
    );
  }

  // Valore SIMULATO post-commissioni (le commissioni escono dal patrimonio).
  const postTradeTotal = total.minus(totalFees);
  if (postTradeTotal.lte(0)) {
    infeasibleReasons.push('il valore simulato post-commissioni non è positivo');
  }
  const executable = infeasibleReasons.length === 0;
  const residualBase = postTradeTotal.gt(0) ? postTradeTotal : null;

  // Deviazioni residue stimate sul valore POST-commissioni + invariante.
  let simulatedPositions = ZERO;
  for (const r of rows) {
    if (r.instrumentId === null) continue;
    let newValue = r.currentValueEur;
    if (!r.suppressed && !r.blockedReason && r.estimatedEur) {
      newValue = r.action === 'BUY' ? newValue.plus(r.estimatedEur) : newValue.minus(r.estimatedEur);
    }
    simulatedPositions = simulatedPositions.plus(newValue);
    r.residualDeviationPp = residualBase
      ? newValue.div(residualBase).times(100).minus(r.targetWeightPct).abs()
      : null;
  }
  const cashRow: PlanRow = {
    instrumentId: null, ticker: 'Cash (liquidità)',
    currentValueEur: inp.cashEur, currentWeightPct: inp.cashEur.div(total).times(100),
    targetWeightPct: cashTargetPct, deltaWeightPp: inp.cashEur.div(total).times(100).minus(cashTargetPct),
    action: null, sellAll: false, theoreticalEur: null, quantity: null, estimatedEur: null, feeEur: null,
    residualDeviationPp: residualBase ? cash.div(residualBase).times(100).minus(cashTargetPct).abs() : null,
    priceNative: null, suppressed: false, suppressReason: null, blockedReason: null, stale: false,
  };
  rows.push(cashRow);

  const hadCashIssues = reductions.length > 0;
  return {
    status: 'ok', blockReasons: [], rows,
    totalValueEur: total,
    postTradeTotalEur: postTradeTotal,
    simulatedPositionsValueEur: simulatedPositions,
    cashBeforeEur: inp.cashEur, cashAfterEur: cash, totalFeesEur: totalFees,
    executable, infeasibleReasons,
    cashShortfall: hadCashIssues ? { availableEur: cashAfterSells, requiredEur, reductions } : null,
    staleWarnings,
  };
}
