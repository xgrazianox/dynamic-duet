import { Decimal } from './decimal';
import type { PositionValuation } from './pnl';
import { isStalePrice, daysBetweenIso } from './staleness';
import type { RegimeState } from './regimeState';
import type { RebalancePlan } from './rebalance';

/* =========================================================================
 * F5 — Alert reali (sez. 5/6 del mandato). Tipi NUOVI, non i vecchi mock:
 * niente resolved/status; i derivati non hanno "Segna risolto".
 * Valori finanziari: Decimal nel dominio, stringhe SOLO ai confini (message).
 * ========================================================================= */

export type F5AlertKind = 'DERIVED' | 'REGIME_EVENT';
export type F5AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type F5AlertCode =
  | 'VALUATION_INCOMPLETE' | 'STALE_PRICE' | 'TARGET_DEVIATION' | 'SELL_ALL_REQUIRED'
  | 'TAKE_PROFIT' | 'REGIME_SWITCH' | 'ONBOARDING_NO_DECISION' | 'ONBOARDING_NO_TARGET'
  | 'CASH_SHORTFALL';

export interface F5Alert {
  id: string;                 // deterministico (codice+entità)
  kind: F5AlertKind;
  code: F5AlertCode;
  severity: F5AlertSeverity;
  title: string;
  reason: string;             // motivo
  current: string;            // dato corrente
  threshold: string;          // soglia/condizione
  action: { label: string; to: string; instrumentId?: string };  // azione disponibile
  exitCondition: string;      // condizione di uscita
  instrumentId?: string;
  decisionId?: string;        // solo REGIME_EVENT
}

export interface AlertInstrumentInfo { id: string; ticker: string; }
export interface AlertsInputs {
  valuations: PositionValuation[];
  instruments: AlertInstrumentInfo[];
  regimeState: RegimeState;
  hasActiveTargetForApplicable: boolean;
  plan: RebalancePlan | null;   // già calcolato (fonte unica dei pesi)
  takeProfitPct: Decimal;
  stalePriceDays: number;
  tolerancePp: Decimal;
  asOf: string;
}

const pct = (d: Decimal) => `${d.toFixed(2)}%`;
const pp = (d: Decimal) => `${d.toFixed(2)} pp`;

export function deriveAlerts(inp: AlertsInputs): F5Alert[] {
  const out: F5Alert[] = [];
  const tickerOf = new Map(inp.instruments.map(i => [i.id, i.ticker]));
  const tk = (id: string) => tickerOf.get(id) ?? `${id.slice(0, 8)}…`;
  const rs = inp.regimeState;

  // 5.1 Valorizzazione incompleta (blocca il piano — il piano stesso è 'blocked')
  const missing = inp.valuations.filter(v => v.quantity.gt(0) && v.status !== 'valued');
  if (missing.length > 0) {
    const detail = missing.map(v => `${tk(v.instrumentId)} (${v.status === 'missing_price' ? 'prezzo mancante' : `cambio ${v.currency} mancante`})`).join(', ');
    out.push({
      id: 'dev:valuation-incomplete', kind: 'DERIVED', code: 'VALUATION_INCOMPLETE', severity: 'WARNING',
      title: 'Valorizzazione incompleta',
      reason: `${missing.length} posizione/i aperte non valorizzabili: ${detail}`,
      current: detail, threshold: 'ogni posizione aperta deve avere prezzo e cambio confermato',
      action: { label: 'Apri Strumenti & Prezzi', to: '/inputs' },
      exitCondition: 'prezzo disponibile e FX confermato per ogni strumento elencato',
    });
  }

  // 5.2 Prezzo stantio (per strumento; non blocca)
  for (const v of inp.valuations) {
    if (!v.quantity.gt(0) || v.status !== 'valued' || !v.lastPriceDate) continue;
    if (isStalePrice(v.lastPriceDate, inp.asOf, inp.stalePriceDays)) {
      const age = daysBetweenIso(v.lastPriceDate, inp.asOf);
      out.push({
        id: `dev:stale:${v.instrumentId}`, kind: 'DERIVED', code: 'STALE_PRICE', severity: 'WARNING',
        title: `Prezzo stantio — ${tk(v.instrumentId)}`,
        reason: `ultimo prezzo ${v.lastPriceNative?.toFixed(4)} del ${v.lastPriceDate} (${age} giorni fa)`,
        current: `${age} giorni`, threshold: `> ${inp.stalePriceDays} giorni`,
        action: { label: 'Aggiorna prezzo', to: '/inputs', instrumentId: v.instrumentId },
        exitCondition: 'inserimento di un prezzo più recente della soglia',
        instrumentId: v.instrumentId,
      });
    }
  }

  // 5.3 Deviazioni dal target — fonte unica: le righe del piano (se non bloccato)
  if (inp.plan && inp.plan.status === 'ok') {
    for (const r of inp.plan.rows) {
      if (r.instrumentId !== null && r.sellAll) {
        out.push({
          id: `dev:sellall:${r.instrumentId}`, kind: 'DERIVED', code: 'SELL_ALL_REQUIRED', severity: 'WARNING',
          title: `Fuori target — ${r.ticker}`,
          reason: 'posizione posseduta ma assente dal target attivo: richiesta vendita totale',
          current: `peso ${pct(r.currentWeightPct)}`, threshold: 'strumento non previsto dal target',
          action: { label: 'Apri piano di ribilanciamento', to: '/portfolio?tab=rebalance', instrumentId: r.instrumentId },
          exitCondition: 'posizione chiusa oppure strumento reinserito nel target',
          instrumentId: r.instrumentId,
        });
      } else if (r.deltaWeightPp.abs().gt(inp.tolerancePp)) {
        out.push({
          id: `dev:deviation:${r.instrumentId ?? 'cash'}`, kind: 'DERIVED', code: 'TARGET_DEVIATION', severity: 'WARNING',
          title: `Deviazione dal target — ${r.ticker}`,
          reason: `peso corrente ${pct(r.currentWeightPct)} vs target ${pct(r.targetWeightPct)}`,
          current: pp(r.deltaWeightPp.abs()), threshold: `> ${pp(inp.tolerancePp)}`,
          action: { label: 'Apri piano di ribilanciamento', to: '/portfolio?tab=rebalance', instrumentId: r.instrumentId ?? undefined },
          exitCondition: 'deviazione rientrata entro la tolleranza',
          instrumentId: r.instrumentId ?? undefined,
        });
      }
    }
    // 5.7 Cash insufficiente (dal motore)
    if (inp.plan.cashShortfall) {
      const cs = inp.plan.cashShortfall;
      out.push({
        id: 'dev:cash-shortfall', kind: 'DERIVED', code: 'CASH_SHORTFALL', severity: 'WARNING',
        title: 'Cash insufficiente per il piano completo',
        reason: cs.reductions.join('; '),
        current: `disponibile €${cs.availableEur.toFixed(2)}`, threshold: `richiesto €${cs.requiredEur.toFixed(2)}`,
        action: { label: 'Apri piano di ribilanciamento', to: '/portfolio?tab=rebalance' },
        exitCondition: 'nuova liquidità o vendite che liberano capienza',
      });
    }
  }

  // 5.4 Take-profit (bordo INCLUSO; costo > 0 obbligatorio)
  for (const v of inp.valuations) {
    if (!v.quantity.gt(0) || v.status !== 'valued' || !v.unrealizedPnlEur) continue;
    if (!v.totalCostEur.gt(0)) continue; // nessuna divisione per costo nullo
    const ret = v.unrealizedPnlEur.div(v.totalCostEur).times(100);
    if (ret.gte(inp.takeProfitPct)) {
      out.push({
        id: `dev:takeprofit:${v.instrumentId}`, kind: 'DERIVED', code: 'TAKE_PROFIT', severity: 'INFO',
        title: `Take-profit — ${tk(v.instrumentId)}`,
        reason: `rendimento non realizzato ${pct(ret)} ≥ soglia ${pct(inp.takeProfitPct)}`,
        current: pct(ret), threshold: `≥ ${pct(inp.takeProfitPct)}`,
        action: { label: 'Apri vendita', to: 'modal:SELL', instrumentId: v.instrumentId },
        exitCondition: 'rendimento sotto soglia oppure posizione chiusa',
        instrumentId: v.instrumentId,
      });
    }
  }

  // 5.5 Eventi switch non acknowledged (unico alert con azione persistente)
  for (const d of rs.unacknowledgedSwitches) {
    out.push({
      id: `evt:switch:${d.id}`, kind: 'REGIME_EVENT', code: 'REGIME_SWITCH', severity: 'CRITICAL',
      title: `Cambio regime → ${d.final_regime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'}`,
      reason: `decisione del mese ${d.as_of_month.slice(0, 7)} con is_switch`,
      current: `nuovo regime applicabile: ${d.final_regime}`, threshold: 'switch non ancora preso in visione',
      action: { label: 'Presa visione', to: 'ack' },
      exitCondition: 'presa visione (l\'eventuale piano di migrazione resta finché il regime non è applicato)',
      decisionId: d.id,
    });
  }

  // 5.6 Onboarding
  if (rs.applicableRegime === null) {
    out.push({
      id: 'dev:onboarding-decision', kind: 'DERIVED', code: 'ONBOARDING_NO_DECISION', severity: 'INFO',
      title: 'Nessuna decisione di regime',
      reason: 'non esiste ancora una decisione determinata persistita',
      current: 'regime applicabile: nessuno', threshold: 'serve almeno una valutazione determinata',
      action: { label: 'Apri Signal Engine', to: '/signals' },
      exitCondition: 'prima decisione determinata persistita',
    });
  } else if (!inp.hasActiveTargetForApplicable) {
    out.push({
      id: 'dev:onboarding-target', kind: 'DERIVED', code: 'ONBOARDING_NO_TARGET', severity: 'INFO',
      title: 'Target non confermato',
      reason: `nessun target ACTIVE per il regime applicabile (${rs.applicableRegime})`,
      current: 'target attivo: nessuno', threshold: 'serve un target confermato per il regime applicabile',
      action: { label: 'Apri editor target', to: rs.applicableRegime === 'RISK_ON' ? '/risk-on' : '/risk-off' },
      exitCondition: 'conferma di un target per il regime applicabile',
    });
  }

  return out;
}
