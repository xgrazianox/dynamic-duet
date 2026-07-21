import {
  Alert,
  PortfolioPosition,
  TargetAllocation,
  StrategyConfig,
  SLEEVES,
} from '@/types/portfolio';

/**
 * Compute dynamic (data-driven) alerts from the current portfolio vs targets.
 * These alerts are NOT stored in AppState — they are derived on-the-fly, so
 * they naturally disappear when the underlying condition no longer holds.
 *
 * Rules implemented:
 *  - REBALANCE_NEEDED: sleeve weight deviates from target by more than
 *    max(1%, config.tradeRoundingAmount / totalValue), i.e. by an amount
 *    that would actually generate a suggested trade above the rounding.
 *    We emit only when |delta| > 5% (0.05) to avoid noise.
 *  - THEME_OVERWEIGHT_TAKE_PROFIT: THEME sleeve exceeds target relatively by
 *    takeProfitThreshold (default +30% relative, i.e. current > target * 1.3).
 */
export function computeDynamicAlerts(
  positions: PortfolioPosition[],
  targets: TargetAllocation[],
  config: StrategyConfig,
  asOfDate: string
): Alert[] {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValueEur, 0);
  if (totalValue <= 0) return [];

  const alerts: Alert[] = [];

  targets.forEach((target) => {
    const position = positions.find(
      (p) => p.sleeveKey === target.sleeveKey && !p.isClosed
    );
    const currentValue = position?.marketValueEur ?? 0;
    const currentWeight = currentValue / totalValue;
    const delta = currentWeight - target.baseWeight;
    const sleeve = SLEEVES[target.sleeveKey];
    const sleeveName = sleeve?.name || target.sleeveKey;

    // REBALANCE_NEEDED: |delta| > 5%
    if (Math.abs(delta) > 0.05) {
      const suggestedTrade =
        Math.round((-delta * totalValue) / config.tradeRoundingAmount) *
        config.tradeRoundingAmount;
      const action = suggestedTrade > 0 ? 'BUY' : 'SELL';
      alerts.push({
        id: `dyn-reb-${target.sleeveKey}`,
        asOfDate,
        severity: 'WARNING',
        code: 'REBALANCE_NEEDED',
        message: `${sleeveName}: peso ${(currentWeight * 100).toFixed(1)}% vs target ${(
          target.baseWeight * 100
        ).toFixed(1)}% (Δ ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%). Ribilanciamento consigliato.`,
        resolved: false,
        status: 'OPEN',
        resolutionType: action === 'BUY' ? 'OPEN_TRADE_MODAL_BUY' : 'OPEN_TRADE_MODAL_SELL',
        targetPage: 'PORTFOLIO',
        targetEntity: {
          sleeveKey: target.sleeveKey,
          instrumentId: position?.instrumentId,
        },
        prefillPayload: {
          suggestedAmountEur: Math.abs(suggestedTrade),
          suggestedAction: action,
        },
      });
    }

    // THEME_OVERWEIGHT_TAKE_PROFIT: only THEME sleeves.
    if (sleeve?.category === 'THEME' && target.baseWeight > 0) {
      const relOverweight = currentWeight / target.baseWeight - 1;
      if (relOverweight > config.takeProfitThreshold) {
        const suggestedTrade =
          Math.round((-delta * totalValue) / config.tradeRoundingAmount) *
          config.tradeRoundingAmount;
        alerts.push({
          id: `dyn-tp-${target.sleeveKey}`,
          asOfDate,
          severity: 'WARNING',
          code: 'THEME_OVERWEIGHT_TAKE_PROFIT',
          message: `${sleeveName} +${(relOverweight * 100).toFixed(0)}% sopra target (soglia +${(
            config.takeProfitThreshold * 100
          ).toFixed(0)}%). Considera take profit.`,
          resolved: false,
          status: 'OPEN',
          resolutionType: 'OPEN_TRADE_MODAL_SELL',
          targetPage: 'PORTFOLIO',
          targetEntity: {
            sleeveKey: target.sleeveKey,
            instrumentId: position?.instrumentId,
          },
          prefillPayload: {
            suggestedAmountEur: Math.abs(suggestedTrade),
            suggestedAction: 'SELL',
          },
        });
      }
    }
  });

  return alerts;
}