import { D, Decimal, ZERO } from './decimal';
import type { PositionState, CashState } from './positions';
import type { PriceRow } from './types';

/** Ultima quotazione ≤ asOf (o l'ultima disponibile se asOf non fornito). */
export function latestPriceFor(
  prices: PriceRow[],
  instrumentId: string,
  asOf?: string,
): Decimal | null {
  let best: PriceRow | null = null;
  for (const p of prices) {
    if (p.instrument_id !== instrumentId) continue;
    if (asOf && p.price_date > asOf) continue;
    if (!best || p.price_date > best.price_date) best = p;
  }
  return best ? D(best.close_price) : null;
}

export interface PositionValuation {
  instrumentId: string;
  quantity: Decimal;
  averageCostEur: Decimal;
  totalCostEur: Decimal;
  lastPriceEur: Decimal | null;
  marketValueEur: Decimal;         // qty * lastPrice; 0 se prezzo mancante
  unrealizedPnlEur: Decimal;       // marketValue - totalCost (se prezzo noto)
  realizedPnlEur: Decimal;
  hasPrice: boolean;
}

export function valuePositions(
  positions: Map<string, PositionState>,
  prices: PriceRow[],
  asOf?: string,
): PositionValuation[] {
  const out: PositionValuation[] = [];
  for (const [id, p] of positions) {
    if (p.quantity.isZero() && p.realizedPnlEur.isZero()) continue;
    const price = latestPriceFor(prices, id, asOf);
    const mv = price ? p.quantity.times(price) : ZERO;
    const upnl = price ? mv.minus(p.totalCostEur) : ZERO;
    out.push({
      instrumentId: id,
      quantity: p.quantity,
      averageCostEur: p.averageCostEur,
      totalCostEur: p.totalCostEur,
      lastPriceEur: price,
      marketValueEur: mv,
      unrealizedPnlEur: upnl,
      realizedPnlEur: p.realizedPnlEur,
      hasPrice: !!price,
    });
  }
  return out;
}

export interface PortfolioTotals {
  cashEur: Decimal;
  positionsValueEur: Decimal;
  totalValueEur: Decimal;
  totalCostEur: Decimal;
  unrealizedPnlEur: Decimal;
  realizedPnlEur: Decimal;
  incomeEur: Decimal;
  feesEur: Decimal;
  netContributionsEur: Decimal;    // deposits - withdrawals
}

export function totals(
  cash: CashState,
  valuations: PositionValuation[],
): PortfolioTotals {
  let posValue = ZERO;
  let totalCost = ZERO;
  let upnl = ZERO;
  for (const v of valuations) {
    posValue = posValue.plus(v.marketValueEur);
    totalCost = totalCost.plus(v.totalCostEur);
    upnl = upnl.plus(v.unrealizedPnlEur);
  }
  return {
    cashEur: cash.cashEur,
    positionsValueEur: posValue,
    totalValueEur: cash.cashEur.plus(posValue),
    totalCostEur: totalCost,
    unrealizedPnlEur: upnl,
    realizedPnlEur: cash.realizedPnlEur,
    incomeEur: cash.incomeEur,
    feesEur: cash.feesEur,
    netContributionsEur: cash.deposits.minus(cash.withdrawals),
  };
}