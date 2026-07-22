import { D, Decimal, ONE, ZERO } from './decimal';
import type { PositionState, CashState } from './positions';
import type { PriceRow, FxRow, InstrumentRow, CurrencyCode } from './types';

/** Ultima quotazione ≤ asOf (in valuta NATIVA dello strumento). */
export function latestPriceFor(
  prices: PriceRow[],
  instrumentId: string,
  asOf?: string,
): { price: Decimal; date: string } | null {
  let best: PriceRow | null = null;
  for (const p of prices) {
    if (p.instrument_id !== instrumentId) continue;
    if (asOf && p.price_date > asOf) continue;
    if (!best || p.price_date > best.price_date) best = p;
  }
  return best ? { price: D(best.close_price), date: best.price_date } : null;
}

/** Ultimo cambio EUR-per-unit per la valuta ≤ asOf. EUR → sempre 1. */
export function latestFxFor(
  fxRates: FxRow[],
  currency: CurrencyCode,
  asOf?: string,
): { fx: Decimal; date: string } | null {
  if (currency === 'EUR') return { fx: ONE, date: '0001-01-01' };
  let best: FxRow | null = null;
  for (const r of fxRates) {
    if (r.currency !== currency) continue;
    if (asOf && r.rate_date > asOf) continue;
    if (!best || r.rate_date > best.rate_date) best = r;
  }
  return best ? { fx: D(best.eur_per_unit), date: best.rate_date } : null;
}

/**
 * Risultato discriminato: MAI zero per dato mancante.
 *  - 'valued'         → marketValueEur / unrealizedPnlEur presenti
 *  - 'missing_price'  → nessun prezzo ≤ asOf
 *  - 'missing_fx'     → prezzo presente ma nessun FX ≤ asOf per la valuta
 */
export type ValuationStatus = 'valued' | 'missing_price' | 'missing_fx';

export interface PositionValuation {
  instrumentId: string;
  currency: CurrencyCode;
  quantity: Decimal;
  averageCostEur: Decimal;
  totalCostEur: Decimal;
  realizedPnlEur: Decimal;
  status: ValuationStatus;
  lastPriceNative: Decimal | null;
  lastPriceDate: string | null;
  fxEurPerUnit: Decimal | null;
  fxDate: string | null;
  marketValueEur: Decimal | null;
  unrealizedPnlEur: Decimal | null;
  /** Legacy: true SOLO quando status='valued'. NON usare per calcolo. */
  hasPrice: boolean;
}

export function valuePositions(
  positions: Map<string, PositionState>,
  prices: PriceRow[],
  instruments: InstrumentRow[],
  fxRates: FxRow[],
  asOf?: string,
): PositionValuation[] {
  const ccyOf = new Map(instruments.map((i) => [i.id, i.currency]));
  const out: PositionValuation[] = [];
  for (const [id, p] of positions) {
    if (p.quantity.isZero() && p.realizedPnlEur.isZero()) continue;
    const currency = ccyOf.get(id) ?? 'EUR';
    const pr = latestPriceFor(prices, id, asOf);
    if (!pr) {
      out.push({
        instrumentId: id, currency,
        quantity: p.quantity, averageCostEur: p.averageCostEur,
        totalCostEur: p.totalCostEur, realizedPnlEur: p.realizedPnlEur,
        status: 'missing_price',
        lastPriceNative: null, lastPriceDate: null,
        fxEurPerUnit: null, fxDate: null,
        marketValueEur: null, unrealizedPnlEur: null,
        hasPrice: false,
      });
      continue;
    }
    const fx = latestFxFor(fxRates, currency, asOf);
    if (!fx) {
      out.push({
        instrumentId: id, currency,
        quantity: p.quantity, averageCostEur: p.averageCostEur,
        totalCostEur: p.totalCostEur, realizedPnlEur: p.realizedPnlEur,
        status: 'missing_fx',
        lastPriceNative: pr.price, lastPriceDate: pr.date,
        fxEurPerUnit: null, fxDate: null,
        marketValueEur: null, unrealizedPnlEur: null,
        hasPrice: false,
      });
      continue;
    }
    const mv = p.quantity.times(pr.price).times(fx.fx);
    const upnl = mv.minus(p.totalCostEur);
    out.push({
      instrumentId: id, currency,
      quantity: p.quantity, averageCostEur: p.averageCostEur,
      totalCostEur: p.totalCostEur, realizedPnlEur: p.realizedPnlEur,
      status: 'valued',
      lastPriceNative: pr.price, lastPriceDate: pr.date,
      fxEurPerUnit: fx.fx, fxDate: fx.date,
      marketValueEur: mv, unrealizedPnlEur: upnl,
      hasPrice: true,
    });
  }
  return out;
}

export interface PortfolioTotals {
  cashEur: Decimal;
  positionsValueEur: Decimal | null;
  totalValueEur: Decimal | null;
  totalCostEur: Decimal;
  unrealizedPnlEur: Decimal | null;
  realizedPnlEur: Decimal;
  incomeEur: Decimal;
  feesEur: Decimal;
  netContributionsEur: Decimal;    // deposits - withdrawals
  /** P/L gestionale totale = realizzato + non realizzato + income − fee.
   *  Incorpora il non realizzato → `null` se una valorizzazione manca. */
  managerialPnlEur: Decimal | null;
  /** Numero di posizioni aperte (quantità > 0). Sempre determinabile. */
  openPositionsCount: number;
  hasMissingValuations: boolean;
}

export function totals(
  cash: CashState,
  valuations: PositionValuation[],
): PortfolioTotals {
  let posValue = ZERO;
  let totalCost = ZERO;
  let upnl = ZERO;
  let missing = false;
  let openCount = 0;
  for (const v of valuations) {
    totalCost = totalCost.plus(v.totalCostEur);
    if (v.quantity.gt(0)) openCount += 1;
    if (v.status === 'valued' && v.marketValueEur && v.unrealizedPnlEur) {
      posValue = posValue.plus(v.marketValueEur);
      upnl = upnl.plus(v.unrealizedPnlEur);
    } else if (v.quantity.gt(0)) {
      // Una valorizzazione manca solo se la posizione è ancora aperta.
      missing = true;
    }
  }
  const unrealized = missing ? null : upnl;
  // Gestionale = realizzato + non realizzato + income − fee (incorpora il non realizzato).
  const managerial = unrealized === null
    ? null
    : cash.realizedPnlEur.plus(unrealized).plus(cash.incomeEur).minus(cash.feesEur);
  return {
    cashEur: cash.cashEur,
    positionsValueEur: missing ? null : posValue,
    totalValueEur: missing ? null : cash.cashEur.plus(posValue),
    totalCostEur: totalCost,
    unrealizedPnlEur: unrealized,
    realizedPnlEur: cash.realizedPnlEur,
    incomeEur: cash.incomeEur,
    feesEur: cash.feesEur,
    netContributionsEur: cash.deposits.minus(cash.withdrawals),
    managerialPnlEur: managerial,
    openPositionsCount: openCount,
    hasMissingValuations: missing,
  };
}