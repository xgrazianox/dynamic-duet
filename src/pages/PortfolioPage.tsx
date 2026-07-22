import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  RefreshCw, 
  Plus, 
  MoreHorizontal, 
  TrendingUp, 
  TrendingDown, 
  X,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import {
  mockTargetsRiskOn,
  mockTargetsRiskOff,
} from '@/lib/mockData';
import { SLEEVES, PortfolioPosition, Instrument, Transaction } from '@/types/portfolio';
import { useSignalEngine } from '@/contexts/SignalEngineContext';
import { useAppState } from '@/contexts/AppStateContext';
import { useAllAlerts } from '@/hooks/useAllAlerts';
import { FX_EURUSD } from '@/lib/mockData';
import { AddInstrumentModal } from '@/components/portfolio/AddInstrumentModal';
import { useOperationModal } from '@/contexts/OperationModalContext';
import { PositionDetailDrawer } from '@/components/portfolio/PositionDetailDrawer';
import { useToast } from '@/hooks/use-toast';
import { parseDeepLinkParams } from '@/lib/alertRouting';

interface EnrichedPosition {
  position: PortfolioPosition;
  instrument: Instrument;
  sleeveName: string;
  currentWeight: number;
  targetWeight: number;
  delta: number;
  deltaEur: number;
  suggestedTradeEur: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  lastPrice: number;
  costBasis: number;
  isInTarget: boolean;
}

export default function PortfolioPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { positions, setPositions, instruments, setInstruments, transactions, setTransactions, resolveAlert, addClosedPosition } = useAppState();
  const { open: openOpModal } = useOperationModal();
  const alerts = useAllAlerts();
  const { finalRegime } = useSignalEngine();
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleString('it-IT'));
  
  // Modal states
  const [addInstrumentOpen, setAddInstrumentOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<EnrichedPosition | null>(null);
  
  // Deep link prefill values
  const [prefillAmount, setPrefillAmount] = useState<number | undefined>(undefined);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  
  // Ref for highlighted row
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const [highlightedPositionId, setHighlightedPositionId] = useState<string | null>(null);

  const regime: 'RISK_ON' | 'RISK_OFF' = finalRegime === 'UNDETERMINED' ? 'RISK_ON' : finalRegime;
  const targets = regime === 'RISK_ON' ? mockTargetsRiskOn : mockTargetsRiskOff;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && !a.resolved).length;
  const warningAlerts = alerts.filter(a => a.severity === 'WARNING' && !a.resolved).length;

  const totalValue = useMemo(() => 
    positions.reduce((sum, p) => sum + p.marketValueEur, 0), 
    [positions]
  );

  const enrichedPositions: EnrichedPosition[] = useMemo(() => {
    return positions
      .filter(p => !showOnlyActive || !p.isClosed)
      .map(position => {
        const instrument = instruments.find(i => i.id === position.instrumentId);
        if (!instrument) return null;
        const sleeve = SLEEVES[position.sleeveKey];
        const target = targets.find(t => t.sleeveKey === position.sleeveKey);
        
        const currentWeight = position.marketValueEur / totalValue;
        const targetWeight = target?.baseWeight || 0;
        // Convention: delta = current − target (positive ⇒ sovrappeso).
        const delta = currentWeight - targetWeight;
        const deltaEur = delta * totalValue;
        // Trade suggerito = riporta a target: −delta × totalValue (positivo ⇒ COMPRA).
        const suggestedTradeEur = Math.round((-deltaEur) / 50) * 50;
        
        const lastPrice = position.lastPrice || (position.marketValueEur / (position.quantity || 1));
        const costBasis = (position.averageBuyPrice || lastPrice) * (position.quantity || 1);
        const unrealizedPL = position.marketValueEur - costBasis;
        const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;
        
        const isInTarget = Math.abs(delta) < 0.005; // ±0.5% threshold
        
        return {
          position,
          instrument,
          sleeveName: sleeve?.name || position.sleeveKey,
          currentWeight,
          targetWeight,
          delta,
          deltaEur,
          suggestedTradeEur,
          unrealizedPL,
          unrealizedPLPercent,
          lastPrice,
          costBasis,
          isInTarget
        };
      })
      .filter((x): x is EnrichedPosition => x !== null)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [positions, instruments, targets, totalValue, showOnlyActive]);

  // Handle deep-link from alerts
  useEffect(() => {
    const deepLink = parseDeepLinkParams(searchParams);
    if (deepLink.action || deepLink.sleeveKey || deepLink.instrumentId || deepLink.alertId) {
      let targetPosition = deepLink.instrumentId 
        ? enrichedPositions.find(ep => ep.instrument.id === deepLink.instrumentId)
        : enrichedPositions.find(ep => ep.position.sleeveKey === deepLink.sleeveKey);
      
      if (targetPosition) {
        setSelectedPosition(targetPosition);
        setHighlightedPositionId(targetPosition.position.id);
        if (deepLink.amount) setPrefillAmount(deepLink.amount);
        const onSuccess = () => {
          if (deepLink.alertId) resolveAlert(deepLink.alertId);
        };
        if (deepLink.action === 'buy') {
          openOpModal({ kind: 'BUY', instrumentId: targetPosition.instrument.id, onSuccess });
        } else if (deepLink.action === 'sell') {
          openOpModal({ kind: 'SELL', instrumentId: targetPosition.instrument.id, onSuccess });
        } else if (deepLink.action === 'close') {
          const q = targetPosition.position.quantity ? String(targetPosition.position.quantity) : '';
          openOpModal({ kind: 'SELL', instrumentId: targetPosition.instrument.id, quantity: q, closePosition: true, onSuccess });
        }
        setTimeout(() => setHighlightedPositionId(null), 3000);
      }
      if (deepLink.alertId) {
        if (!deepLink.action) {
          resolveAlert(deepLink.alertId);
        } else {
          setPendingAlertId(deepLink.alertId);
        }
      }
      setSearchParams({});
    }
  }, [searchParams, enrichedPositions, setSearchParams, resolveAlert, openOpModal]);

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLastUpdate(new Date().toLocaleString('it-IT'));
    setIsRefreshing(false);
    toast({
      title: "Quotazioni aggiornate",
      description: "Tutti i prezzi sono stati aggiornati con successo."
    });
  };

  const handleIncrease = (enriched: EnrichedPosition) => {
    setSelectedPosition(enriched);
    openOpModal({ kind: 'BUY', instrumentId: enriched.instrument.id });
  };

  const handleDecrease = (enriched: EnrichedPosition) => {
    setSelectedPosition(enriched);
    openOpModal({ kind: 'SELL', instrumentId: enriched.instrument.id });
  };

  const handleClose = (enriched: EnrichedPosition) => {
    setSelectedPosition(enriched);
    const q = enriched.position.quantity ? String(enriched.position.quantity) : '';
    openOpModal({ kind: 'SELL', instrumentId: enriched.instrument.id, quantity: q, closePosition: true });
  };

  const handleViewDetail = (enriched: EnrichedPosition) => {
    setSelectedPosition(enriched);
    setDetailDrawerOpen(true);
  };

  const handleConfirmIncrease = (amount: number, quantity: number, price: number, notes: string, date: string) => {
    if (!selectedPosition) return;
    const isNonEur = selectedPosition.instrument.currency !== 'EUR';
    const fx = isNonEur ? FX_EURUSD : 1;

    const newTransaction: Transaction = {
      id: `t${Date.now()}`,
      instrumentId: selectedPosition.instrument.id,
      sleeveKey: selectedPosition.position.sleeveKey,
      type: 'BUY',
      date,
      quantity,
      pricePerUnit: price,
      totalValueEur: amount,
      ...(isNonEur ? { fxRateUsed: fx } : {}),
      notes,
      createdAt: new Date().toISOString()
    };
    
    setTransactions(prev => [...prev, newTransaction]);
    
    // Update position
    setPositions(prev => prev.map(p => {
      if (p.id === selectedPosition.position.id) {
        const oldQuantity = p.quantity || 0;
        // averageBuyPrice stays in native currency; convert EUR amount to native for cost math.
        const oldCostNative = (p.averageBuyPrice || 0) * oldQuantity;
        const addedCostNative = amount * fx;
        const newTotalQuantity = oldQuantity + quantity;
        const newAvgPrice = newTotalQuantity > 0 ? (oldCostNative + addedCostNative) / newTotalQuantity : (p.averageBuyPrice || 0);
        
        return {
          ...p,
          quantity: newTotalQuantity,
          marketValueEur: p.marketValueEur + amount,
          averageBuyPrice: newAvgPrice
        };
      }
      return p;
    }));
    
    // modal closed via unified provider
    toast({
      title: "Posizione aumentata",
      description: `Aggiunto €${amount.toLocaleString('it-IT')} a ${selectedPosition.instrument.name}`
    });
    if (pendingAlertId) { resolveAlert(pendingAlertId); setPendingAlertId(null); }
  };

  const handleConfirmDecrease = (amount: number, quantity: number, price: number, notes: string, date: string) => {
    if (!selectedPosition) return;
    const isNonEur = selectedPosition.instrument.currency !== 'EUR';
    const fx = isNonEur ? FX_EURUSD : 1;

    const newTransaction: Transaction = {
      id: `t${Date.now()}`,
      instrumentId: selectedPosition.instrument.id,
      sleeveKey: selectedPosition.position.sleeveKey,
      type: 'SELL',
      date,
      quantity,
      pricePerUnit: price,
      totalValueEur: amount,
      ...(isNonEur ? { fxRateUsed: fx } : {}),
      notes,
      createdAt: new Date().toISOString()
    };
    
    setTransactions(prev => [...prev, newTransaction]);

    // Record realized P&L (all in EUR; convert native prices via fx).
    const buyPriceNative = selectedPosition.position.averageBuyPrice || price;
    const investedEur = (buyPriceNative * quantity) / fx;
    const buyDateStr = selectedPosition.position.asOfDate || date;
    const holdingDays = Math.max(
      0,
      Math.floor((new Date(date).getTime() - new Date(buyDateStr).getTime()) / 86400000)
    );
    addClosedPosition({
      id: `cp-${newTransaction.id}`,
      instrumentId: selectedPosition.instrument.id,
      sleeveKey: selectedPosition.position.sleeveKey,
      buyDate: buyDateStr,
      sellDate: date,
      buyPrice: buyPriceNative,
      sellPrice: price,
      quantity,
      investedAmount: investedEur,
      soldAmount: amount,
      profitLossEur: amount - investedEur,
      profitLossPercent: investedEur > 0 ? ((amount - investedEur) / investedEur) * 100 : 0,
      holdingDays,
    });
    
    // Update position
    setPositions(prev => prev.map(p => {
      if (p.id === selectedPosition.position.id) {
        const newQuantity = (p.quantity || 0) - quantity;
        const newMarketValue = p.marketValueEur - amount;
        
        if (newQuantity <= 0 || newMarketValue <= 0) {
          return { ...p, quantity: 0, marketValueEur: 0, isClosed: true };
        }
        
        return {
          ...p,
          quantity: newQuantity,
          marketValueEur: newMarketValue
        };
      }
      return p;
    }));
    
    // modal closed via unified provider
    toast({
      title: "Posizione ridotta",
      description: `Venduto €${amount.toLocaleString('it-IT')} di ${selectedPosition.instrument.name}`
    });
    if (pendingAlertId) { resolveAlert(pendingAlertId); setPendingAlertId(null); }
  };

  const handleConfirmClose = (notes: string, date: string) => {
    if (!selectedPosition) return;
    const isNonEur = selectedPosition.instrument.currency !== 'EUR';
    const fx = isNonEur ? FX_EURUSD : 1;

    const newTransaction: Transaction = {
      id: `t${Date.now()}`,
      instrumentId: selectedPosition.instrument.id,
      sleeveKey: selectedPosition.position.sleeveKey,
      type: 'CLOSE',
      date,
      quantity: selectedPosition.position.quantity || 0,
      pricePerUnit: selectedPosition.lastPrice,
      totalValueEur: selectedPosition.position.marketValueEur,
      ...(isNonEur ? { fxRateUsed: fx } : {}),
      notes,
      createdAt: new Date().toISOString()
    };
    
    setTransactions(prev => [...prev, newTransaction]);

    // Record realized P&L for full close
    const qtyClose = selectedPosition.position.quantity || 0;
    const buyPriceClose = selectedPosition.position.averageBuyPrice || selectedPosition.lastPrice;
    const investedClose = (buyPriceClose * qtyClose) / fx;
    const soldClose = selectedPosition.position.marketValueEur;
    const buyDateClose = selectedPosition.position.asOfDate || date;
    const holdingDaysClose = Math.max(
      0,
      Math.floor((new Date(date).getTime() - new Date(buyDateClose).getTime()) / 86400000)
    );
    if (qtyClose > 0) {
      addClosedPosition({
        id: `cp-${newTransaction.id}`,
        instrumentId: selectedPosition.instrument.id,
        sleeveKey: selectedPosition.position.sleeveKey,
        buyDate: buyDateClose,
        sellDate: date,
        buyPrice: buyPriceClose,
        sellPrice: selectedPosition.lastPrice,
        quantity: qtyClose,
        investedAmount: investedClose,
        soldAmount: soldClose,
        profitLossEur: soldClose - investedClose,
        profitLossPercent: investedClose > 0 ? ((soldClose - investedClose) / investedClose) * 100 : 0,
        holdingDays: holdingDaysClose,
      });
    }
    
    setPositions(prev => prev.map(p => {
      if (p.id === selectedPosition.position.id) {
        return { ...p, quantity: 0, marketValueEur: 0, isClosed: true };
      }
      return p;
    }));
    
    // modal closed via unified provider
    toast({
      title: "Posizione chiusa",
      description: `Chiusa posizione su ${selectedPosition.instrument.name}`
    });
    if (pendingAlertId) { resolveAlert(pendingAlertId); setPendingAlertId(null); }
  };

  const handleAddInstrument = (instrument: Instrument, position?: { quantity: number; price: number; date: string; notes: string }) => {
    // Add new instrument
    setInstruments(prev => [...prev, instrument]);
    
    if (position) {
      const newPosition: PortfolioPosition = {
        id: `p${Date.now()}`,
        instrumentId: instrument.id,
        sleeveKey: instrument.sleeveKey,
        asOfDate: position.date,
        quantity: position.quantity,
        marketValueEur: position.quantity * position.price,
        averageBuyPrice: position.price,
        note: position.notes,
        isClosed: false
      };
      
      setPositions(prev => [...prev, newPosition]);
      
      const newTransaction: Transaction = {
        id: `t${Date.now()}`,
        instrumentId: instrument.id,
        sleeveKey: instrument.sleeveKey,
        type: 'BUY',
        date: position.date,
        quantity: position.quantity,
        pricePerUnit: position.price,
        totalValueEur: position.quantity * position.price,
        notes: position.notes,
        createdAt: new Date().toISOString()
      };
      
      setTransactions(prev => [...prev, newTransaction]);
    }
    
    setAddInstrumentOpen(false);
    toast({
      title: "Strumento aggiunto",
      description: `${instrument.name} aggiunto al portafoglio`
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Valore Totale Portafoglio</p>
                <p className="text-3xl font-bold text-foreground">
                  €{totalValue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div>
                <p className="text-sm text-muted-foreground">Regime Attuale</p>
                <Badge variant={regime === 'RISK_ON' ? 'default' : 'secondary'} className="mt-1">
                  {regime === 'RISK_ON' ? 'RISK-ON' : 'RISK-OFF'}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Alerts summary */}
              <div className="flex items-center gap-2">
                {criticalAlerts > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {criticalAlerts} critici
                  </Badge>
                )}
                {warningAlerts > 0 && (
                  <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
                    <Info className="h-3 w-3" />
                    {warningAlerts} warning
                  </Badge>
                )}
              </div>
              
              {/* Refresh button */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Ultimo update: {lastUpdate}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefreshPrices}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Aggiorna quotazioni
                </Button>
              </div>
              
              {/* Toggle active only */}
              <div className="flex items-center gap-2">
                <Switch 
                  id="show-active" 
                  checked={showOnlyActive}
                  onCheckedChange={setShowOnlyActive}
                />
                <Label htmlFor="show-active" className="text-sm">Solo attive</Label>
              </div>
              
              {/* Add instrument */}
              <Button onClick={() => setAddInstrumentOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi strumento
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions table */}
      <Card>
        <CardHeader>
          <CardTitle>Posizioni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Strumento</TableHead>
                  <TableHead className="text-right">Prezzo Acq.</TableHead>
                  <TableHead className="text-right">Quantità</TableHead>
                  <TableHead className="text-right">Prezzo Att.</TableHead>
                  <TableHead className="text-right">Valore</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                  <TableHead className="text-right">Peso Att.</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Trade Sugg.</TableHead>
                  <TableHead className="text-center">Stato</TableHead>
                  <TableHead className="text-center">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedPositions.map((enriched) => (
                  <TableRow 
                    key={enriched.position.id}
                    ref={highlightedPositionId === enriched.position.id ? highlightedRowRef : null}
                    className={`${Math.abs(enriched.delta) > 0.05 ? 'bg-yellow-500/10' : ''} ${highlightedPositionId === enriched.position.id ? 'ring-2 ring-primary animate-pulse' : ''}`}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{enriched.instrument.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {enriched.instrument.ticker} • {enriched.sleeveName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {enriched.instrument.currency === 'USD' ? '$' : enriched.instrument.currency === 'CHF' ? '₣' : '€'}{enriched.position.averageBuyPrice?.toFixed(2) || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {enriched.position.quantity?.toLocaleString('it-IT') || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {enriched.instrument.currency === 'USD' ? '$' : enriched.instrument.currency === 'CHF' ? '₣' : '€'}{enriched.lastPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      €{enriched.position.marketValueEur.toLocaleString('it-IT')}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${enriched.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <div className="flex flex-col items-end">
                        <span>{enriched.unrealizedPL >= 0 ? '+' : ''}€{enriched.unrealizedPL.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                        <span className="text-xs">
                          ({enriched.unrealizedPLPercent >= 0 ? '+' : ''}{enriched.unrealizedPLPercent.toFixed(1)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(enriched.currentWeight * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(enriched.targetWeight * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className={`text-right font-mono ${enriched.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {enriched.delta >= 0 ? '+' : ''}{(enriched.delta * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className={`text-right font-mono ${enriched.suggestedTradeEur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {enriched.suggestedTradeEur >= 0 ? '+' : ''}€{enriched.suggestedTradeEur.toLocaleString('it-IT')}
                    </TableCell>
                    <TableCell className="text-center">
                      {enriched.isInTarget ? (
                        <Badge variant="outline" className="gap-1 border-green-500 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          In target
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-orange-500 text-orange-600">
                          <AlertTriangle className="h-3 w-3" />
                          Da ribal.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border">
                          <DropdownMenuItem onClick={() => handleIncrease(enriched)}>
                            <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                            Aumenta
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDecrease(enriched)}>
                            <TrendingDown className="h-4 w-4 mr-2 text-red-600" />
                            Diminuisci
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleClose(enriched)}>
                            <X className="h-4 w-4 mr-2" />
                            Chiudi posizione
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewDetail(enriched)}>
                            <Info className="h-4 w-4 mr-2" />
                            Dettagli
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <AddInstrumentModal
        open={addInstrumentOpen}
        onOpenChange={setAddInstrumentOpen}
        onAdd={handleAddInstrument}
        existingInstruments={instruments}
      />
      
      <PositionDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        position={selectedPosition}
        transactions={transactions.filter(t => t.instrumentId === selectedPosition?.instrument.id)}
      />
    </div>
  );
}