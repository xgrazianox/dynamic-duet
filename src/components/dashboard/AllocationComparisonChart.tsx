import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { PortfolioPosition, TargetAllocation, SLEEVES } from '@/types/portfolio';

interface AllocationComparisonChartProps {
  positions: PortfolioPosition[];
  targetsRiskOn: TargetAllocation[];
  targetsRiskOff: TargetAllocation[];
  currentRegime: 'RISK_ON' | 'RISK_OFF';
}

export function AllocationComparisonChart({ 
  positions, 
  targetsRiskOn, 
  targetsRiskOff,
  currentRegime 
}: AllocationComparisonChartProps) {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValueEur, 0);
  
  // Get all unique sleeve keys from positions and both targets
  const allSleeveKeys = new Set([
    ...positions.map(p => p.sleeveKey),
    ...targetsRiskOn.map(t => t.sleeveKey),
    ...targetsRiskOff.map(t => t.sleeveKey),
  ]);

  const chartData = Array.from(allSleeveKeys).map(sleeveKey => {
    const position = positions.find(p => p.sleeveKey === sleeveKey);
    const targetOn = targetsRiskOn.find(t => t.sleeveKey === sleeveKey);
    const targetOff = targetsRiskOff.find(t => t.sleeveKey === sleeveKey);
    
    const currentWeight = position ? (position.marketValueEur / totalValue) * 100 : 0;
    
    return {
      name: SLEEVES[sleeveKey]?.name || sleeveKey.replace(/_/g, ' '),
      sleeveKey,
      current: Math.round(currentWeight * 10) / 10,
      riskOn: targetOn ? Math.round(targetOn.baseWeight * 1000) / 10 : 0,
      riskOff: targetOff ? Math.round(targetOff.baseWeight * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.current - a.current);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Confronto Allocazione
          <span className={`text-sm px-2 py-1 rounded ${currentRegime === 'RISK_ON' ? 'bg-risk-on/20 text-risk-on' : 'bg-risk-off/20 text-risk-off'}`}>
            Regime: {currentRegime === 'RISK_ON' ? 'Risk-On' : 'Risk-Off'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              type="number" 
              domain={[0, 'auto']}
              tickFormatter={(value) => `${value}%`}
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={150}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => <span className="text-foreground">{value}</span>}
            />
            <Bar 
              dataKey="current" 
              name="Attuale" 
              fill="hsl(var(--primary))" 
              radius={[0, 4, 4, 0]}
              barSize={12}
            />
            <Bar 
              dataKey="riskOn" 
              name="Target Risk-On" 
              fill="hsl(var(--risk-on))" 
              radius={[0, 4, 4, 0]}
              barSize={12}
              opacity={currentRegime === 'RISK_ON' ? 1 : 0.4}
            />
            <Bar 
              dataKey="riskOff" 
              name="Target Risk-Off" 
              fill="hsl(var(--risk-off))" 
              radius={[0, 4, 4, 0]}
              barSize={12}
              opacity={currentRegime === 'RISK_OFF' ? 1 : 0.4}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}