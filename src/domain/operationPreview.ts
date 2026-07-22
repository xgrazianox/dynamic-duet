import { D, Decimal, ZERO, ONE, roundMoney } from './decimal';
import type { FxRow, CurrencyCode } from './types';

export type OpKind = 'DEPOSIT' | 'WITHDRAW' | 'BUY' | 'SELL' | 'DIVIDEND' | 'OTHER_INCOME' | 'FEE';

export interface FxProposal {
  fx: Decimal;
  fxAsString: string;
  source: 'historical' | 'default_fx' | 'none';
  date: string | null;
  currency: CurrencyCode;
}

/**
 * FX proposto: ULTIMO fx_rate con rate_date ≤ effective_date. Se assente,
 * fallback su portfolio_settings.default_fx (marcato come 'default_fx').
 * MAI usa un cambio futuro.
 */
export function proposeFx(
  fxRates: FxRow[],
  currency: CurrencyCode,
  effectiveDate: string,
  defaultFx: Record<string, string> | null | undefined,
): FxProposal {
  if (currency === 'EUR') {
    return { fx: ONE, fxAsString: '1', source: 'historical', date: null, currency };
  }
  let best: FxRow | null = null;
  for (const r of fxRates) {
    if (r.currency !== currency) continue;
    if (r.rate_date > effectiveDate) continue; // FUTURO: escluso
    if (!best || r.rate_date > best.rate_date) best = r;
  }
  if (best) {
    return { fx: D(best.eur_per_unit), fxAsString: best.eur_per_unit, source: 'historical', date: best.rate_date, currency };
  }
  const dv = defaultFx?.[currency];
  if (dv !== undefined && dv !== null) {
    return { fx: D(dv), fxAsString: dv, source: 'default_fx', date: null, currency };
  }
  return { fx: ZERO, fxAsString: '', source: 'none', date: null, currency };
}

export interface PreviewInputs {
  kind: OpKind;
  cashBeforeEur: Decimal;
  positionQtyBefore: Decimal;
  positionAvgCostEur: Decimal;   // costo medio EUR/unità (post-replay)
  quantity?: string;             // BUY/SELL
  priceCcy?: string;             // BUY/SELL (valuta nativa)
  fxEurPerUnit?: string;         // BUY/SELL non-EUR (1 se EUR)
  feesEur?: string;              // BUY/SELL
  grossAmountEur?: string;       // DEPOSIT/WITHDRAW/DIVIDEND/OTHER_INCOME/FEE
  quantityStep: Decimal;         // per warning quantity_step
  currency: CurrencyCode;
  requiresFx: boolean;           // strumento non EUR
  hasFxProposal: boolean;        // FX proposto disponibile
}

export interface PreviewResult {
  cashAfterEur: Decimal;
  positionQtyAfter: Decimal;
  estimatedGrossEur: Decimal;   // controvalore EUR stimato (BUY/SELL) o gross diretto
  feesEur: Decimal;
  realizedPnlEur: Decimal | null;
  warnings: string[];
}

function stepMismatch(qty: Decimal, step: Decimal): boolean {
  if (step.isZero()) return false;
  const r = qty.div(step);
  const rounded = r.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return !r.minus(rounded).abs().lt('1e-10');
}

export function previewOperation(i: PreviewInputs): PreviewResult {
  const warnings: string[] = [];
  const fees = D(i.feesEur ?? '0');
  let cashAfter = i.cashBeforeEur;
  let qtyAfter = i.positionQtyBefore;
  let gross = ZERO;
  let realized: Decimal | null = null;

  switch (i.kind) {
    case 'DEPOSIT': {
      gross = D(i.grossAmountEur || '0');
      cashAfter = i.cashBeforeEur.plus(gross);
      break;
    }
    case 'WITHDRAW': {
      gross = D(i.grossAmountEur || '0');
      cashAfter = i.cashBeforeEur.minus(gross);
      if (cashAfter.lt(0)) warnings.push('Cash insufficiente per il prelievo.');
      break;
    }
    case 'FEE': {
      gross = D(i.grossAmountEur || '0');
      cashAfter = i.cashBeforeEur.minus(gross);
      if (cashAfter.lt(0)) warnings.push('Cash insufficiente per la commissione.');
      break;
    }
    case 'DIVIDEND':
    case 'OTHER_INCOME': {
      gross = D(i.grossAmountEur || '0');
      cashAfter = i.cashBeforeEur.plus(gross);
      break;
    }
    case 'BUY': {
      const qty = D(i.quantity || '0');
      const price = D(i.priceCcy || '0');
      const fx = D(i.fxEurPerUnit || (i.currency === 'EUR' ? '1' : '0'));
      if (i.requiresFx && !i.hasFxProposal && (!i.fxEurPerUnit || fx.isZero())) {
        warnings.push('FX richiesto per strumento non-EUR: conferma un cambio.');
      }
      gross = roundMoney(qty.times(price).times(fx));
      cashAfter = i.cashBeforeEur.minus(gross).minus(fees);
      qtyAfter = i.positionQtyBefore.plus(qty);
      if (cashAfter.lt(0)) warnings.push('Cash insufficiente per l\'acquisto.');
      if (stepMismatch(qty, i.quantityStep)) warnings.push('Quantità non allineata al quantity_step.');
      break;
    }
    case 'SELL': {
      const qty = D(i.quantity || '0');
      const price = D(i.priceCcy || '0');
      const fx = D(i.fxEurPerUnit || (i.currency === 'EUR' ? '1' : '0'));
      if (i.requiresFx && !i.hasFxProposal && (!i.fxEurPerUnit || fx.isZero())) {
        warnings.push('FX richiesto per strumento non-EUR: conferma un cambio.');
      }
      gross = roundMoney(qty.times(price).times(fx));
      cashAfter = i.cashBeforeEur.plus(gross).minus(fees);
      qtyAfter = i.positionQtyBefore.minus(qty);
      if (qtyAfter.lt(0)) warnings.push('Quantità eccedente rispetto alla posizione posseduta.');
      if (stepMismatch(qty, i.quantityStep)) warnings.push('Quantità non allineata al quantity_step.');
      // P/L realizzato stimato = (gross − fees) − CM × qty
      realized = gross.minus(fees).minus(i.positionAvgCostEur.times(qty));
      break;
    }
  }

  return {
    cashAfterEur: cashAfter,
    positionQtyAfter: qtyAfter,
    estimatedGrossEur: gross,
    feesEur: fees,
    realizedPnlEur: realized,
    warnings,
  };
}
