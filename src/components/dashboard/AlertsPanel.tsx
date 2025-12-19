import { AlertTriangle, Info, XCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertSeverity } from '@/types/portfolio';

interface AlertsPanelProps {
  alerts: Alert[];
}

const severityConfig: Record<AlertSeverity, { icon: typeof Info; color: string; bg: string }> = {
  INFO: { icon: Info, color: 'text-info', bg: 'bg-info/10' },
  WARNING: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  CRITICAL: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const unresolvedAlerts = alerts.filter(a => !a.resolved);

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-glow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <h3 className="font-semibold">Alert Attivi</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {unresolvedAlerts.length} non risolti
        </span>
      </div>

      {unresolvedAlerts.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/30">
          <CheckCircle className="h-5 w-5 text-risk-on" />
          <p className="text-sm text-muted-foreground">Nessun alert attivo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unresolvedAlerts.slice(0, 5).map(alert => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;
            
            return (
              <div 
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg ${config.bg}`}
              >
                <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{alert.code.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {alert.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
