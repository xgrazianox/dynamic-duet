import { PortfolioPosition, TargetAllocation, SLEEVES } from '@/types/portfolio';

interface HoldingsTableProps {
  positions: PortfolioPosition[];
  targets: TargetAllocation[];
}

export function HoldingsTable({ positions, targets }: HoldingsTableProps) {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValueEur, 0);

  const tableData = positions.map(position => {
    const target = targets.find(t => t.sleeveKey === position.sleeveKey);
    const sleeve = SLEEVES[position.sleeveKey];
    const currentWeight = position.marketValueEur / totalValue;
    const targetWeight = target?.baseWeight || 0;
    const delta = currentWeight - targetWeight;
    const deltaEur = delta * totalValue;

    return {
      ...position,
      sleeve,
      currentWeight,
      targetWeight,
      delta,
      deltaEur,
    };
  }).sort((a, b) => b.marketValueEur - a.marketValueEur);

  return (
    <div className="rounded-xl border border-border bg-card card-glow overflow-hidden">
      <div className="p-6 border-b border-border">
        <h3 className="font-semibold">Posizioni Attuali</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Confronto con allocazione target
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="bg-secondary/30">
              <th>Sleeve</th>
              <th>Categoria</th>
              <th className="text-right">Valore €</th>
              <th className="text-right">Peso Attuale</th>
              <th className="text-right">Peso Target</th>
              <th className="text-right">Delta</th>
              <th className="text-right">Delta €</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map(row => (
              <tr key={row.id}>
                <td className="font-medium">{row.sleeve?.name || row.sleeveKey}</td>
                <td>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
                    {row.sleeve?.category || 'N/A'}
                  </span>
                </td>
                <td className="text-right font-mono">
                  €{row.marketValueEur.toLocaleString('it-IT')}
                </td>
                <td className="text-right font-mono">
                  {(row.currentWeight * 100).toFixed(2)}%
                </td>
                <td className="text-right font-mono">
                  {(row.targetWeight * 100).toFixed(2)}%
                </td>
                <td className={`text-right font-mono ${row.delta > 0.005 ? 'positive' : row.delta < -0.005 ? 'negative' : ''}`}>
                  {row.delta > 0 ? '+' : ''}{(row.delta * 100).toFixed(2)}%
                </td>
                <td className={`text-right font-mono ${row.deltaEur > 50 ? 'positive' : row.deltaEur < -50 ? 'negative' : ''}`}>
                  {row.deltaEur > 0 ? '+' : ''}€{Math.round(row.deltaEur).toLocaleString('it-IT')}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-secondary/30 font-semibold">
              <td colSpan={2}>Totale</td>
              <td className="text-right font-mono">
                €{totalValue.toLocaleString('it-IT')}
              </td>
              <td className="text-right font-mono">100.00%</td>
              <td className="text-right font-mono">100.00%</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
