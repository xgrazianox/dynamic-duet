import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Upload, CheckCircle, XCircle, Edit2, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mockPricePoints } from '@/lib/mockData';
import { useAppState } from '@/contexts/AppStateContext';
import { parseDeepLinkParams } from '@/lib/alertRouting';
import { SLEEVES, Instrument, SleeveCategory } from '@/types/portfolio';
import { toast } from '@/hooks/use-toast';

export default function InputsPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const { instruments, setInstruments, resolveAlert } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNewInstrument, setIsNewInstrument] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [pricesHighlighted, setPricesHighlighted] = useState(false);
  const pricesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dl = parseDeepLinkParams(searchParams);
    if (dl.focus === 'prices') {
      setPricesHighlighted(true);
      setTimeout(() => pricesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      setTimeout(() => setPricesHighlighted(false), 3000);
    }
    if (dl.alertId) {
      resolveAlert(dl.alertId);
      const next = new URLSearchParams(searchParams);
      next.delete('alertId');
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, resolveAlert, setSearchParams]);

  const handleImportCsv = async () => {
    setIsImporting(true);
    await new Promise(r => setTimeout(r, 1200));
    setIsImporting(false);
    toast({
      title: 'Import CSV completato',
      description: 'Serie prezzi importate (simulazione).',
    });
  };

  const handleUpdatePrices = async () => {
    setIsUpdatingPrices(true);
    await new Promise(r => setTimeout(r, 1500));
    setIsUpdatingPrices(false);
    toast({
      title: 'Quotazioni aggiornate',
      description: 'Prezzi mensili sincronizzati dai provider attivi.',
    });
  };

  const getLatestPrice = (instrumentId: string) => {
    const prices = mockPricePoints
      .filter(p => p.instrumentId === instrumentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    return prices[0];
  };

  const handleEditInstrument = (instrument: Instrument) => {
    setEditingInstrument({ ...instrument });
    setIsNewInstrument(false);
    setIsDialogOpen(true);
  };

  const handleAddInstrument = () => {
    const newInstrument: Instrument = {
      id: `new-${Date.now()}`,
      name: '',
      ticker: '',
      isin: '',
      exchange: '',
      provider: 'yahoo',
      currency: 'EUR',
      category: 'CORE',
      sleeveKey: 'WORLD_CORE',
      isActive: true,
    };
    setEditingInstrument(newInstrument);
    setIsNewInstrument(true);
    setIsDialogOpen(true);
  };

  const handleSaveInstrument = () => {
    if (!editingInstrument) return;

    if (!editingInstrument.name.trim() || !editingInstrument.ticker.trim()) {
      toast({
        title: "Errore",
        description: "Nome e Ticker sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    if (isNewInstrument) {
      setInstruments(prev => [...prev, editingInstrument]);
      toast({
        title: "Strumento aggiunto",
        description: `${editingInstrument.name} è stato aggiunto al portafoglio`,
      });
    } else {
      setInstruments(prev => 
        prev.map(i => i.id === editingInstrument.id ? editingInstrument : i)
      );
      toast({
        title: "Strumento modificato",
        description: `${editingInstrument.name} è stato aggiornato`,
      });
    }

    setIsDialogOpen(false);
    setEditingInstrument(null);
  };

  const handleDeleteInstrument = () => {
    if (!editingInstrument) return;
    
    setInstruments(prev => prev.filter(i => i.id !== editingInstrument.id));
    toast({
      title: "Strumento eliminato",
      description: `${editingInstrument.name} è stato rimosso dal portafoglio`,
    });
    setIsDialogOpen(false);
    setEditingInstrument(null);
  };

  const sleeveKeys = Object.keys(SLEEVES);
  const categories: SleeveCategory[] = ['CORE', 'FACTOR', 'THEME', 'HEDGE', 'CASH'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dati & Prezzi</h1>
          <p className="text-muted-foreground mt-1">
            Gestione strumenti e serie prezzi mensili
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" onClick={handleAddInstrument}>
            <Plus className="h-4 w-4" />
            Aggiungi Strumento
          </Button>
          <Button variant="outline" onClick={handleImportCsv} disabled={isImporting}>
            <Upload className={`h-4 w-4 ${isImporting ? 'animate-pulse' : ''}`} />
            Importa CSV
          </Button>
          <Button onClick={handleUpdatePrices} disabled={isUpdatingPrices}>
            <RefreshCw className={`h-4 w-4 ${isUpdatingPrices ? 'animate-spin' : ''}`} />
            Aggiorna Quotazioni
          </Button>
        </div>
      </div>

      {/* Instruments Table */}
      <div className="rounded-xl border border-border bg-card card-glow overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="font-semibold">Strumenti Configurati</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {instruments.length} strumenti attivi
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="bg-secondary/30">
                <th>Nome</th>
                <th>Ticker</th>
                <th>Sleeve</th>
                <th>Categoria</th>
                <th>Valuta</th>
                <th>Provider</th>
                <th className="text-right">Ultimo Prezzo</th>
                <th className="text-center">Stato</th>
                <th className="text-center">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map(instrument => {
                const latestPrice = getLatestPrice(instrument.id);
                const sleeve = SLEEVES[instrument.sleeveKey];
                
                return (
                  <tr key={instrument.id}>
                    <td className="font-medium">{instrument.name}</td>
                    <td className="font-mono text-sm">{instrument.ticker}</td>
                    <td>{sleeve?.name || instrument.sleeveKey}</td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
                        {instrument.category}
                      </span>
                    </td>
                    <td className="font-mono">{instrument.currency}</td>
                    <td className="text-sm text-muted-foreground">{instrument.provider}</td>
                    <td className="text-right font-mono">
                      {latestPrice ? (
                        <>
                          {instrument.currency === 'EUR' ? '€' : '$'}
                          {latestPrice.closePrice.toFixed(2)}
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-center">
                      {instrument.isActive ? (
                        <CheckCircle className="h-5 w-5 text-risk-on inline" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive inline" />
                      )}
                    </td>
                    <td className="text-center">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => handleEditInstrument(instrument)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price History for selected instrument */}
      <div
        ref={pricesRef}
        className={`grid grid-cols-1 lg:grid-cols-2 gap-6 rounded-xl transition-all ${pricesHighlighted ? 'ring-2 ring-primary animate-pulse p-2' : ''}`}
      >
        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <h3 className="font-semibold mb-4">Serie Prezzi MSCI World</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {mockPricePoints
              .filter(p => p.instrumentId === '1')
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 12)
              .map(price => (
                <div key={price.id} className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">{price.date}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">€{price.closePrice.toFixed(2)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      price.source === 'AUTO_API' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                    }`}>
                      {price.source === 'AUTO_API' ? 'Auto' : 'Manuale'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <h3 className="font-semibold mb-4">Serie Prezzi Gold</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {mockPricePoints
              .filter(p => p.instrumentId === '10')
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 12)
              .map(price => (
                <div key={price.id} className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">{price.date}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">€{price.closePrice.toFixed(2)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      price.source === 'AUTO_API' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                    }`}>
                      {price.source === 'AUTO_API' ? 'Auto' : 'Manuale'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Edit/Add Instrument Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isNewInstrument ? 'Aggiungi Nuovo Strumento' : 'Modifica Strumento'}
            </DialogTitle>
          </DialogHeader>
          
          {editingInstrument && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={editingInstrument.name}
                    onChange={(e) => setEditingInstrument({
                      ...editingInstrument,
                      name: e.target.value
                    })}
                    placeholder="Es. MSCI World Core"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ticker">Ticker *</Label>
                  <Input
                    id="ticker"
                    value={editingInstrument.ticker}
                    onChange={(e) => setEditingInstrument({
                      ...editingInstrument,
                      ticker: e.target.value
                    })}
                    placeholder="Es. IWDA.AS"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="isin">ISIN</Label>
                  <Input
                    id="isin"
                    value={editingInstrument.isin || ''}
                    onChange={(e) => setEditingInstrument({
                      ...editingInstrument,
                      isin: e.target.value
                    })}
                    placeholder="Es. IE00B4L5Y983"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exchange">Exchange</Label>
                  <Input
                    id="exchange"
                    value={editingInstrument.exchange || ''}
                    onChange={(e) => setEditingInstrument({
                      ...editingInstrument,
                      exchange: e.target.value
                    })}
                    placeholder="Es. XAMS"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={editingInstrument.category}
                    onValueChange={(value: SleeveCategory) => setEditingInstrument({
                      ...editingInstrument,
                      category: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sleeve</Label>
                  <Select
                    value={editingInstrument.sleeveKey}
                    onValueChange={(value) => setEditingInstrument({
                      ...editingInstrument,
                      sleeveKey: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sleeveKeys.map(key => (
                        <SelectItem key={key} value={key}>
                          {SLEEVES[key]?.name || key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valuta</Label>
                  <Select
                    value={editingInstrument.currency}
                    onValueChange={(value: 'EUR' | 'USD' | 'CHF') => setEditingInstrument({
                      ...editingInstrument,
                      currency: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CHF">CHF</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Provider Dati</Label>
                  <Select
                    value={editingInstrument.provider}
                    onValueChange={(value) => setEditingInstrument({
                      ...editingInstrument,
                      provider: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yahoo">Yahoo Finance</SelectItem>
                      <SelectItem value="stooq">Stooq</SelectItem>
                      <SelectItem value="alpha_vantage">Alpha Vantage</SelectItem>
                      <SelectItem value="manual">Manuale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="isActive">Strumento Attivo</Label>
                <Switch
                  id="isActive"
                  checked={editingInstrument.isActive}
                  onCheckedChange={(checked) => setEditingInstrument({
                    ...editingInstrument,
                    isActive: checked
                  })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            {!isNewInstrument && (
              <Button variant="destructive" onClick={handleDeleteInstrument}>
                <Trash2 className="h-4 w-4 mr-2" />
                Elimina
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleSaveInstrument}>
                <Save className="h-4 w-4 mr-2" />
                Salva
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}