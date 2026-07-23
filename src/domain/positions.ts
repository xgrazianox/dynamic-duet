import { D, Decimal, ZERO } from './decimal';
import type { LedgerRow } from './types';

export interface PositionState {
  instrumentId: string;
  quantity: Decimal;          // qty corrente
  totalCostEur: Decimal;      // somma costi di carico (base media ponderata)
  averageCostEur: Decimal;    // costo medio (8 dec logiche) = totalCost / qty
  realizedPnlEur: Decimal;    // P&L realizzato accumulato su questo strumento
}

export interface CashState {
  cashEur: Decimal;
  realizedPnlEur: Decimal;   // P&L realizzato totale (somma su tutte le posizioni)
  incomeEur: Decimal;        // dividendi + altri proventi
  feesEur: Decimal;          // fees stand-alone (op FEE) + fees su trade
  deposits: Decimal;
  withdrawals: Decimal;
}

/**
 * Effetto realizzato di una singola operazione di VENDITA, emesso dallo STESSO
 * replay canonico (costo medio vigente al momento della vendita). Riusato dal
 * modulo performance per il win-rate: nessun secondo algoritmo del costo medio.
 */
export interface SellEffect {
  operationId: string;
  instrumentId: string;
  effectiveDate: string;
  realizedPnlEur: Decimal;
}

const emptyPosition = (id: string): PositionState => ({
  instrumentId: id,
  quantity: ZERO,
  totalCostEur: ZERO,
  averageCostEur: ZERO,
  realizedPnlEur: ZERO,
});

/**
 * Applica il ledger (già ordinato e con REVERSAL neutralizzate) allo stato.
 * REGOLA CARDINE: le proiezioni usano ESCLUSIVAMENTE i campi persistiti
 * (gross_amount_eur, fees_eur, opening_cost_eur). NON ricalcoliamo qty*price*fx.
 */
export function projectPositions(activeLedger: LedgerRow[]): {
  positions: Map<string, PositionState>;
  cash: CashState;
  sellEffects: SellEffect[];
} {
  const positions = new Map<string, PositionState>();
  const sellEffects: SellEffect[] = [];
  const cash: CashState = {
    cashEur: ZERO,
    realizedPnlEur: ZERO,
    incomeEur: ZERO,
    feesEur: ZERO,
    deposits: ZERO,
    withdrawals: ZERO,
  };

  const getPos = (id: string): PositionState => {
    let p = positions.get(id);
    if (!p) {
      p = emptyPosition(id);
      positions.set(id, p);
    }
    return p;
  };

  for (const op of activeLedger) {
    const gross = D(op.gross_amount_eur);
    const fees = D(op.fees_eur);
    const qty = D(op.quantity);

    switch (op.op_type) {
      case 'DEPOSIT':
      case 'OPENING_CASH':
        cash.cashEur = cash.cashEur.plus(gross);
        if (op.op_type === 'DEPOSIT') cash.deposits = cash.deposits.plus(gross);
        break;

      case 'WITHDRAW':
        cash.cashEur = cash.cashEur.minus(gross);
        cash.withdrawals = cash.withdrawals.plus(gross);
        break;

      case 'FEE':
        cash.cashEur = cash.cashEur.minus(gross);
        cash.feesEur = cash.feesEur.plus(gross);
        break;

      case 'DIVIDEND':
      case 'OTHER_INCOME':
        cash.cashEur = cash.cashEur.plus(gross);
        cash.incomeEur = cash.incomeEur.plus(gross);
        break;

      case 'BUY': {
        if (!op.instrument_id) break;
        const p = getPos(op.instrument_id);
        // Cash: -(gross + fees)
        cash.cashEur = cash.cashEur.minus(gross).minus(fees);
        cash.feesEur = cash.feesEur.plus(fees);
        // Costo di carico: gross + fees capitalizzate.
        const newQty = p.quantity.plus(qty);
        const newTotalCost = p.totalCostEur.plus(gross).plus(fees);
        p.quantity = newQty;
        p.totalCostEur = newTotalCost;
        p.averageCostEur = newQty.isZero() ? ZERO : newTotalCost.div(newQty);
        break;
      }

      case 'SELL': {
        if (!op.instrument_id) break;
        const p = getPos(op.instrument_id);
        // Cash: +(gross - fees)
        cash.cashEur = cash.cashEur.plus(gross).minus(fees);
        cash.feesEur = cash.feesEur.plus(fees);
        // Realized P&L = gross_venduto - (avg_cost * qty) - fees
        const costOfSold = p.averageCostEur.times(qty);
        const pnl = gross.minus(costOfSold).minus(fees);
        p.realizedPnlEur = p.realizedPnlEur.plus(pnl);
        cash.realizedPnlEur = cash.realizedPnlEur.plus(pnl);
        sellEffects.push({
          operationId: op.id,
          instrumentId: op.instrument_id,
          effectiveDate: op.effective_date,
          realizedPnlEur: pnl,
        });
        // Riduco quantità, riduco costo per qty * avg (il CM resta invariato).
        const newQty = p.quantity.minus(qty);
        const newTotalCost = p.totalCostEur.minus(costOfSold);
        p.quantity = newQty;
        // Se azzerata, azzera anche costo per idempotenza numerica.
        if (newQty.abs().lt('1e-10')) {
          p.quantity = ZERO;
          p.totalCostEur = ZERO;
          p.averageCostEur = ZERO;
        } else {
          p.totalCostEur = newTotalCost;
          // Average cost invariato: newTotalCost/newQty === averageCostEur
          p.averageCostEur = newTotalCost.div(newQty);
        }
        break;
      }

      case 'OPENING_POSITION': {
        if (!op.instrument_id) break;
        const p = getPos(op.instrument_id);
        // Cash NON tocca: l'apertura non è un movimento cassa.
        // Costo di carico = opening_cost_eur (server-authoritative).
        const openingCost = D(op.opening_cost_eur);
        const newQty = p.quantity.plus(qty);
        const newTotalCost = p.totalCostEur.plus(openingCost);
        p.quantity = newQty;
        p.totalCostEur = newTotalCost;
        p.averageCostEur = newQty.isZero() ? ZERO : newTotalCost.div(newQty);
        break;
      }

      case 'REVERSAL':
        // Non deve mai arrivare qui: replayLedger elide le coppie.
        break;
    }
  }

  return { positions, cash, sellEffects };
}