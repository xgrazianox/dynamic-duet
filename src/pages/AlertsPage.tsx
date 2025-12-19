import { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, Clock, Filter, ExternalLink, Check, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { mockAlerts, defaultStrategyConfig } from '@/lib/mockData';
import { Alert, AlertSeverity } from '@/types/portfolio';
import { useAlertNavigation } from '@/hooks/useAlertNavigation';
import { getAlertRoutingConfig } from '@/lib/alertRouting';
import { useToast } from '@/hooks/use-toast';

const severityConfig: Record<AlertSeverity, { icon: typeof Info; label: string; color: string; bg: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  INFO: { icon: Info, label: 'Info', color: 'text-info', bg: 'bg-info/10', badgeVariant: 'secondary' },
  WARNING: { icon: AlertTriangle, label: 'Attenzione', color: 'text-warning', bg: 'bg-warning/10', badgeVariant: 'outline' },
  CRITICAL: { icon: XCircle, label: 'Critico', color: 'text-destructive', bg: 'bg-destructive/10', badgeVariant: 'destructive' },
};

export default function AlertsPage() {
  const { toast } = useToast();
  const { navigateToResolve, getActionLabel, getDescription, getDestinationPreview } = useAlertNavigation();
  const [filter, setFilter] = useState<AlertSeverity | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filteredAlerts = alerts
    .filter(a => filter === 'ALL' || a.severity === filter)
    .filter(a => statusFilter === 'ALL' || (statusFilter === 'OPEN' ? !a.resolved : a.resolved));

  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  const handleResolve = (alertId: string) => {
    setAlerts(prev => prev.map(a => 
      a.id === alertId 
        ? { ...a, resolved: true, status: 'RESOLVED' as const, resolvedAt: new Date().toISOString() } 
        : a
    ));
    toast({
      title: "Alert risolto",
      description: "L'alert è stato marcato come risolto."
    });
  };

  const handleGoAndResolve = (alert: Alert) => {
    navigateToResolve(alert);
  };

  const handleViewDetails = (alert: Alert) => {
    setSelectedAlert(alert);
    setDetailOpen(true);
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Regole & Alert</h1>
          <p className="text-muted-foreground mt-1">
            Configurazione strategia e log eventi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={unresolvedCount > 0 ? 'destructive' : 'secondary'}>
            {unresolvedCount} alert aperti
          </Badge>
        </div>
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Log Eventi</h2>
            <div className="flex items-center gap-2">
              {/* Status filter */}
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'OPEN' | 'RESOLVED')}
                className="bg-secondary border-none rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="ALL">Tutti</option>
                <option value="OPEN">Aperti</option>
                <option value="RESOLVED">Risolti</option>
              </select>
              
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select 
                value={filter}
                onChange={(e) => setFilter(e.target.value as AlertSeverity | 'ALL')}
                className="bg-secondary border-none rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="ALL">Tutte le severity</option>
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
                  const routingConfig = getAlertRoutingConfig(alert.code);
                  const destinationPreview = getDestinationPreview(alert);
                  
                  return (
                    <div 
                      key={alert.id} 
                      className={`p-4 hover:bg-accent/30 transition-colors ${alert.resolved ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant={config.badgeVariant} className="text-xs">
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {alert.code}
                            </span>
                            {alert.resolved && (
                              <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-600">
                                <Check className="h-3 w-3" />
                                Risolto
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">{alert.message}</p>
                          
                          {/* Why & What to do */}
                          {routingConfig && !alert.resolved && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {routingConfig.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {alert.asOfDate}
                            {destinationPreview && !alert.resolved && (
                              <>
                                <span>•</span>
                                <span className="text-primary">→ {destinationPreview}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleViewDetails(alert)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Dettagli
                          </Button>
                          
                          {!alert.resolved && (
                            <>
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="text-xs gap-1"
                                onClick={() => handleGoAndResolve(alert)}
                              >
                                {getActionLabel(alert)}
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-xs"
                                onClick={() => handleResolve(alert.id)}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Segna risolto
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alert Details Drawer */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="overflow-y-auto">
          {selectedAlert && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  {(() => {
                    const config = severityConfig[selectedAlert.severity];
                    const Icon = config.icon;
                    return (
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg}`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                    );
                  })()}
                  <SheetTitle>{selectedAlert.code.replace(/_/g, ' ')}</SheetTitle>
                </div>
                <SheetDescription>{selectedAlert.message}</SheetDescription>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                {/* Status */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Stato</h4>
                  <Badge variant={selectedAlert.resolved ? 'outline' : 'destructive'}>
                    {selectedAlert.resolved ? 'Risolto' : 'Aperto'}
                  </Badge>
                  {selectedAlert.resolvedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Risolto il: {new Date(selectedAlert.resolvedAt).toLocaleString('it-IT')}
                    </p>
                  )}
                </div>

                {/* Why this alert */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Perché questo alert?</h4>
                  <p className="text-sm text-muted-foreground">
                    {getDescription(selectedAlert)}
                  </p>
                </div>

                {/* What to do */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Cosa fare</h4>
                  <p className="text-sm text-muted-foreground">
                    {getAlertRoutingConfig(selectedAlert.code)?.description || 'Verifica la situazione e prendi le azioni necessarie.'}
                  </p>
                </div>

                {/* Prefill info */}
                {selectedAlert.prefillPayload && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Valori suggeriti</h4>
                    <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
                      {selectedAlert.prefillPayload.suggestedAmountEur && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Importo:</span>{' '}
                          <span className="font-mono">€{selectedAlert.prefillPayload.suggestedAmountEur.toLocaleString('it-IT')}</span>
                        </p>
                      )}
                      {selectedAlert.prefillPayload.suggestedAction && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Azione:</span>{' '}
                          <span className="font-medium">{selectedAlert.prefillPayload.suggestedAction}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Destination */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Destinazione</h4>
                  <p className="text-sm text-muted-foreground">
                    {getDestinationPreview(selectedAlert)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-4">
                  {!selectedAlert.resolved && (
                    <>
                      <Button 
                        onClick={() => {
                          handleGoAndResolve(selectedAlert);
                          setDetailOpen(false);
                        }}
                        className="gap-2"
                      >
                        {getActionLabel(selectedAlert)}
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          handleResolve(selectedAlert.id);
                          setDetailOpen(false);
                        }}
                        className="gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Segna come risolto
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}