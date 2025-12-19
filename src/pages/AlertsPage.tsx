import { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, Clock, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockAlerts, defaultStrategyConfig } from '@/lib/mockData';
import { Alert, AlertSeverity } from '@/types/portfolio';

const severityConfig: Record<AlertSeverity, { icon: typeof Info; label: string; color: string; bg: string }> = {
  INFO: { icon: Info, label: 'Info', color: 'text-info', bg: 'bg-info/10' },
  WARNING: { icon: AlertTriangle, label: 'Attenzione', color: 'text-warning', bg: 'bg-warning/10' },
  CRITICAL: { icon: XCircle, label: 'Critico', color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function AlertsPage() {
  const [filter, setFilter] = useState<AlertSeverity | 'ALL'>('ALL');
  const filteredAlerts = filter === 'ALL' 
    ? mockAlerts 
    : mockAlerts.filter(a => a.severity === filter);

  const rules = [
    {
      name: 'Regime MSCI/Gold',
      description: 'Cambia allocazione quando il ratio MSCI/Gold incrocia la media mobile',
      params: [
        { label: 'Mesi SMA', value: defaultStrategyConfig.smaMonths },
      ]
    },
    {
      name: 'Eleggibilità Tema',
      description: 'Un tema è eleggibile per il tilt se sottoperforma MSCI World e ha trend positivo',
      params: [
        { label: 'Soglia sottoperformance', value: `${(defaultStrategyConfig.underperformanceThreshold * 100).toFixed(0)}%` },
        { label: 'SMA prezzo', value: `${defaultStrategyConfig.smaMonths} mesi` },
      ]
    },
    {
      name: 'Tilt Contrarian',
      description: 'Bonus percentuale applicato ai temi eleggibili, sottratto dal cash',
      params: [
        { label: 'Bonus per tema', value: `${(defaultStrategyConfig.themeBonusPercent * 100).toFixed(0)}%` },
        { label: 'Max temi', value: defaultStrategyConfig.maxThemes },
      ]
    },
    {
      name: 'Take Profit Anti-Euforia',
      description: 'Trigger di vendita quando un tema supera il target di una soglia relativa',
      params: [
        { label: 'Soglia take profit', value: `+${(defaultStrategyConfig.takeProfitThreshold * 100).toFixed(0)}%` },
      ]
    },
    {
      name: 'Arrotondamento Trade',
      description: 'I trade suggeriti vengono arrotondati per facilitare l\'esecuzione',
      params: [
        { label: 'Arrotondamento', value: `€${defaultStrategyConfig.tradeRoundingAmount}` },
      ]
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Regole & Alert</h1>
        <p className="text-muted-foreground mt-1">
          Configurazione strategia e log eventi
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rules */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Regole Attive</h2>
          
          {rules.map((rule, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-card p-4 card-glow">
              <h3 className="font-medium mb-2">{rule.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{rule.description}</p>
              <div className="flex flex-wrap gap-2">
                {rule.params.map((param, i) => (
                  <span key={i} className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-secondary text-sm">
                    <span className="text-muted-foreground">{param.label}:</span>
                    <span className="font-mono font-medium">{param.value}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Alerts log */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Log Eventi</h2>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select 
                value={filter}
                onChange={(e) => setFilter(e.target.value as AlertSeverity | 'ALL')}
                className="bg-secondary border-none rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="ALL">Tutti</option>
                <option value="CRITICAL">Critici</option>
                <option value="WARNING">Attenzione</option>
                <option value="INFO">Info</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card card-glow overflow-hidden">
            {filteredAlerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-12 w-12 text-risk-on mx-auto mb-3" />
                <p className="text-muted-foreground">Nessun alert attivo</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredAlerts.map(alert => {
                  const config = severityConfig[alert.severity];
                  const Icon = config.icon;
                  
                  return (
                    <div key={alert.id} className="p-4 hover:bg-accent/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {alert.code}
                            </span>
                          </div>
                          <p className="text-sm">{alert.message}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {alert.asOfDate}
                          </div>
                        </div>
                        {!alert.resolved && (
                          <Button variant="ghost" size="sm" className="text-xs">
                            Risolvi
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
