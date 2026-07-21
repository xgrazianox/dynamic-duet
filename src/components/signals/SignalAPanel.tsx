import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SignalAResult } from '@/types/portfolio';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';

interface SignalAPanelProps {
  result: SignalAResult;
  smaMonths?: number;
  confirmMonths?: number;
  bandPct?: number;
}

export function SignalAPanel({ result, smaMonths = 10, confirmMonths = 2, bandPct = 0.015 }: SignalAPanelProps) {
  const { currentRegime, rawSignal, ratio, sma, upperBand, lowerBand, confirmCount, reason, history } = result;
  
  const isRiskOn = currentRegime === 'RISK_ON';
  const isUndetermined = currentRegime === 'UNDETERMINED';
  
  // Prepare chart data (last 18 months)
  const chartData = history.slice(-18).map(h => ({
    date: h.date.slice(0, 7),
    ratio: h.ratio,
    sma: h.sma,
    upperBand: h.upperBand,
    lowerBand: h.lowerBand,
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-glow">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="text-primary">Sistema A</span>
            <span className="text-muted-foreground">— Doppia Conferma MSCI/Gold</span>
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ratio vs SMA({smaMonths}) con banda anti-whipsaw ±{(bandPct * 100).toFixed(1)}%
          </p>
        </div>
        
        {/* Regime Badge */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
          isUndetermined 
            ? 'bg-muted text-muted-foreground' 
            : isRiskOn 
              ? 'regime-badge-on' 
              : 'regime-badge-off'
        }`}>
          {isUndetermined ? (
            <AlertCircle className="h-4 w-4" />
          ) : isRiskOn ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          {isUndetermined ? 'Non Determinato' : isRiskOn ? 'RISK-ON' : 'RISK-OFF'}
        </div>
      </div>
      
      {/* Chart */}
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={11}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={11}
              domain={['auto', 'auto']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            
            {/* Band area */}
            <Area
              dataKey="upperBand"
              stroke="none"
              fill="hsl(var(--muted))"
              fillOpacity={0.3}
            />
            <Area
              dataKey="lowerBand"
              stroke="none"
              fill="hsl(var(--background))"
              fillOpacity={1}
            />
            
            {/* Lines */}
            <Line 
              type="monotone" 
              dataKey="sma" 
              stroke="hsl(var(--muted-foreground))" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name={`SMA(${smaMonths})`}
            />
            <Line 
              type="monotone" 
              dataKey="ratio" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={false}
              name="Ratio MSCI/Gold"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-3 rounded-lg bg-secondary">
          <p className="text-xs text-muted-foreground">Ratio Corrente</p>
          <p className="font-mono text-lg font-semibold">{ratio.toFixed(3)}</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary">
          <p className="text-xs text-muted-foreground">SMA({smaMonths})</p>
          <p className="font-mono text-lg font-semibold">{sma.toFixed(3)}</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary">
          <p className="text-xs text-muted-foreground">Banda Sup.</p>
          <p className="font-mono text-lg font-semibold">{upperBand.toFixed(3)}</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary">
          <p className="text-xs text-muted-foreground">Banda Inf.</p>
          <p className="font-mono text-lg font-semibold">{lowerBand.toFixed(3)}</p>
        </div>
      </div>
      
      {/* Confirmation Status */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
          confirmCount >= confirmMonths ? 'bg-risk-on/20 text-risk-on' : 'bg-muted text-muted-foreground'
        }`}>
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium">
            Conferma {confirmCount}/{confirmMonths}
            <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
              rawSignal === 'ON' ? 'bg-risk-on/20 text-risk-on' :
              rawSignal === 'OFF' ? 'bg-risk-off/20 text-risk-off' :
              'bg-muted text-muted-foreground'
            }`}>
              Raw: {rawSignal}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{reason}</p>
        </div>
      </div>
      
      {/* History Table */}
      <div className="mt-6">
        <h4 className="text-sm font-medium mb-3">Ultimi 12 mesi</h4>
        <div className="overflow-x-auto">
          <table className="data-table text-xs">
            <thead>
              <tr>
                <th>Mese</th>
                <th>Ratio</th>
                <th>SMA</th>
                <th>Segnale</th>
                <th>Regime</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(-12).reverse().map((h, i) => (
                <tr key={i}>
                  <td className="font-mono">{h.date.slice(0, 7)}</td>
                  <td className="font-mono">{h.ratio.toFixed(3)}</td>
                  <td className="font-mono">{h.sma?.toFixed(3) || '-'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      h.rawSignal === 'ON' ? 'bg-risk-on/20 text-risk-on' :
                      h.rawSignal === 'OFF' ? 'bg-risk-off/20 text-risk-off' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {h.rawSignal}
                    </span>
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      h.confirmedRegime === 'RISK_ON' ? 'bg-risk-on/20 text-risk-on' :
                      h.confirmedRegime === 'RISK_OFF' ? 'bg-risk-off/20 text-risk-off' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {h.confirmedRegime === 'RISK_ON' ? 'ON' : h.confirmedRegime === 'RISK_OFF' ? 'OFF' : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
