import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Loader2 } from 'lucide-react';
import { Instrument, YahooSearchResult, SLEEVES, InstrumentType } from '@/types/portfolio';

interface AddInstrumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (instrument: Instrument, position?: { quantity: number; price: number; date: string; notes: string }) => void;
  existingInstruments: Instrument[];
}

// Mock Yahoo search results
const mockYahooSearch = (query: string): Promise<YahooSearchResult[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const results: YahooSearchResult[] = [
        { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'STOCK' as InstrumentType, currency: 'USD' as const, lastPrice: 178.50 },
        { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'STOCK' as InstrumentType, currency: 'USD' as const, lastPrice: 378.25 },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', type: 'STOCK' as InstrumentType, currency: 'USD' as const, lastPrice: 139.80 },
        { symbol: 'IWDA.AS', name: 'iShares Core MSCI World', exchange: 'AMS', type: 'ETF' as InstrumentType, currency: 'EUR' as const, lastPrice: 85.20 },
        { symbol: 'VWCE.DE', name: 'Vanguard FTSE All-World', exchange: 'XETRA', type: 'ETF' as InstrumentType, currency: 'EUR' as const, lastPrice: 108.40 },
        { symbol: 'GLD', name: 'SPDR Gold Shares', exchange: 'NYSE', type: 'ETC' as InstrumentType, currency: 'USD' as const, lastPrice: 182.30 },
        { symbol: '4GLD.DE', name: 'Xetra-Gold', exchange: 'XETRA', type: 'ETC' as InstrumentType, currency: 'EUR' as const, lastPrice: 72.85 },
        { symbol: 'EQQQ.L', name: 'Invesco EQQQ Nasdaq-100', exchange: 'LSE', type: 'ETF' as InstrumentType, currency: 'EUR' as const, lastPrice: 365.50 },
        { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', type: 'STOCK' as InstrumentType, currency: 'USD' as const, lastPrice: 248.50 },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'STOCK' as InstrumentType, currency: 'USD' as const, lastPrice: 495.20 },
      ].filter(r => 
        r.symbol.toLowerCase().includes(query.toLowerCase()) ||
        r.name.toLowerCase().includes(query.toLowerCase())
      );
      resolve(results);
    }, 500);
  });
};

export function AddInstrumentModal({ open, onOpenChange, onAdd, existingInstruments }: AddInstrumentModalProps) {
  const [step, setStep] = useState<'search' | 'configure' | 'position'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YahooSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<YahooSearchResult | null>(null);
  const [selectedSleeve, setSelectedSleeve] = useState<string>('');
  const [addPosition, setAddPosition] = useState(false);
  
  // Position fields
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = await mockYahooSearch(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleSelectResult = (result: YahooSearchResult) => {
    setSelectedResult(result);
    setPrice(result.lastPrice?.toString() || '');
    setStep('configure');
  };

  const handleConfigureNext = () => {
    if (addPosition) {
      setStep('position');
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    if (!selectedResult || !selectedSleeve) return;

    const newInstrument: Instrument = {
      id: `inst-${Date.now()}`,
      name: selectedResult.name,
      ticker: selectedResult.symbol,
      exchange: selectedResult.exchange,
      provider: 'Yahoo Finance',
      currency: selectedResult.currency,
      category: SLEEVES[selectedSleeve]?.category || 'CORE',
      sleeveKey: selectedSleeve,
      isActive: true,
      instrumentType: selectedResult.type,
      yahooSymbol: selectedResult.symbol,
      exchangeCode: selectedResult.exchange,
    };

    if (addPosition && quantity && price) {
      onAdd(newInstrument, {
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        date,
        notes
      });
    } else {
      onAdd(newInstrument);
    }

    resetForm();
  };

  const resetForm = () => {
    setStep('search');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedResult(null);
    setSelectedSleeve('');
    setAddPosition(false);
    setQuantity('');
    setPrice('');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
  };

  const alreadyExists = (symbol: string) => 
    existingInstruments.some(i => i.ticker.toLowerCase() === symbol.toLowerCase());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Aggiungi Strumento
          </DialogTitle>
          <DialogDescription>
            {step === 'search' && 'Cerca strumenti per nome o ticker'}
            {step === 'configure' && 'Configura lo strumento'}
            {step === 'position' && 'Aggiungi posizione iniziale'}
          </DialogDescription>
        </DialogHeader>
        
        {step === 'search' && (
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="Cerca per nome o ticker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {searchResults.map((result) => (
                <div
                  key={result.symbol}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    alreadyExists(result.symbol) 
                      ? 'opacity-50 cursor-not-allowed bg-muted' 
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => !alreadyExists(result.symbol) && handleSelectResult(result)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{result.name}</span>
                        {alreadyExists(result.symbol) && (
                          <Badge variant="secondary" className="text-xs">Già presente</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {result.symbol} • {result.exchange} • {result.type}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium">
                        {result.currency === 'EUR' ? '€' : '$'}{result.lastPrice?.toFixed(2)}
                      </div>
                      <Badge variant="outline" className="text-xs">{result.currency}</Badge>
                    </div>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && searchQuery && !isSearching && (
                <p className="text-center text-muted-foreground py-8">
                  Nessun risultato trovato
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'configure' && selectedResult && (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedResult.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedResult.symbol} • {selectedResult.exchange}
                  </p>
                </div>
                <Badge>{selectedResult.type}</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categoria / Sleeve</Label>
              <Select value={selectedSleeve} onValueChange={setSelectedSleeve}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona una categoria..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SLEEVES).map((sleeve) => (
                    <SelectItem key={sleeve.key} value={sleeve.key}>
                      {sleeve.name} ({sleeve.category})
                    </SelectItem>
                  ))}
                  <SelectItem value="CUSTOM">Personalizzato (nessun target)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="add-position"
                checked={addPosition}
                onChange={(e) => setAddPosition(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="add-position" className="cursor-pointer">
                Aggiungi subito una posizione
              </Label>
            </div>
          </div>
        )}

        {step === 'position' && selectedResult && (
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <strong>{selectedResult.name}</strong> ({selectedResult.symbol})
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantità</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Prezzo ({selectedResult.currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data acquisto</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note opzionali..."
                rows={2}
              />
            </div>

            {quantity && price && (
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Valore totale:</p>
                <p className="text-lg font-mono font-bold">
                  {selectedResult.currency === 'EUR' ? '€' : '$'}
                  {(parseFloat(quantity) * parseFloat(price)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step !== 'search' && (
            <Button variant="outline" onClick={() => setStep(step === 'position' ? 'configure' : 'search')}>
              Indietro
            </Button>
          )}
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Annulla
          </Button>
          {step === 'search' && (
            <Button disabled>Seleziona uno strumento</Button>
          )}
          {step === 'configure' && (
            <Button onClick={handleConfigureNext} disabled={!selectedSleeve}>
              {addPosition ? 'Continua' : 'Aggiungi'}
            </Button>
          )}
          {step === 'position' && (
            <Button 
              onClick={handleComplete} 
              disabled={!quantity || !price || parseFloat(quantity) <= 0}
            >
              Conferma
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}