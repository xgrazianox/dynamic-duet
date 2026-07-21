import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useSignalEngine } from '@/contexts/SignalEngineContext';

export function RatioChart() {
  const { ratioHistory, config } = useSignalEngine();
  const smaMonths = config.signalA.smaMonths;
  const latestSMA = ratioHistory[ratioHistory.length - 1]?.sma10;

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-glow">
      <div className="mb-4">
        <h3 className="font-semibold">Ratio MSCI/Gold vs SMA({smaMonths})</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ultimi 24 mesi - Determina regime RISK-ON/OFF
        </p>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={ratioHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 18%)" />
            <XAxis 
              dataKey="date" 
              stroke="hsl(215 20% 55%)"
              fontSize={11}
              tickFormatter={(value) => {
                const [year, month] = value.split('-');
                return `${month}/${year.slice(2)}`;
              }}
            />
            <YAxis 
              stroke="hsl(215 20% 55%)"
              fontSize={11}
              domain={['dataMin - 0.1', 'dataMax + 0.1']}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(222 47% 10%)',
                border: '1px solid hsl(222 30% 18%)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelFormatter={(value) => `Data: ${value}`}
              formatter={(value: number, name: string) => [
                value?.toFixed(3),
                name === 'ratio' ? 'Ratio' : `SMA(${smaMonths})`
              ]}
            />
            <Line 
              type="monotone" 
              dataKey="ratio" 
              stroke="hsl(173 80% 40%)" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(173 80% 40%)' }}
            />
            <Line 
              type="monotone" 
              dataKey="sma10" 
              stroke="hsl(38 92% 50%)" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(38 92% 50%)' }}
            />
            {latestSMA && (
              <ReferenceLine 
                y={latestSMA} 
                stroke="hsl(38 92% 50%)" 
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-primary rounded" />
          <span className="text-xs text-muted-foreground">Ratio MSCI/Gold</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-warning rounded" style={{ backgroundImage: 'linear-gradient(90deg, transparent 50%, hsl(222 47% 8%) 50%)', backgroundSize: '6px 100%' }} />
          <span className="text-xs text-muted-foreground">SMA({smaMonths})</span>
        </div>
      </div>
    </div>
  );
}
