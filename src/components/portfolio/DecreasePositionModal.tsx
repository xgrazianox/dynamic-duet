import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrendingDown, AlertTriangle, Info } from 'lucide-react';

const FX_EURUSD = 1.08;
const fxFor = (ccy: 'EUR' | 'USD' | 'CHF') => (ccy === 'USD' ? FX_EURUSD : 1);

interface EnrichedPosition {
  position: {
    id: string;
    quantity?: number;
    marketValueEur: number;
    averageBuyPrice?: number;
  };
  instrument: {
    id: string;
    name: string;
    ticker: string;
    currency: 'EUR' | 'USD' | 'CHF';
  };
  suggestedTradeEur: number;
  lastPrice: number;
}

interface DecreasePositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: EnrichedPosition | null;
  onConfirm: (amount: number, quantity: number, price: number, notes: string, date: string) => void;
}

export function DecreasePositionModal({ open, onOpenChange, position, onConfirm }: DecreasePositionModalProps) {
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [useSuggested, setUseSuggested] = useState(false);
  const [sellAll, setSellAll] = useState(false);

  useEffect(() => {
    if (position) {
      setPrice(position.lastPrice.toFixed(2));
      if (useSuggested && position.suggestedTradeEur < 0) {
        const suggestedSell = Math.abs(position.suggestedTradeEur);
        const qty = Math.floor(suggestedSell / position.lastPrice);
        setQuantity(qty.toString());
        setAmount((qty * position.lastPrice).toFixed(2));
      }
      if (sellAll) {
        setAmount(position.position.marketValueEur.toString());
        setQuantity((position.position.quantity || 0).toString());
      }
    }
  }, [position, useSuggested, sellAll]);

  const handleAmountChange = (v: string) => {
    setAmount(v);
    const p = parseFloat(price);
    const a = parseFloat(v);
    if (!isNaN(a) && !isNaN(p) && p > 0) {
      const fx = position ? fxFor(position.instrument.currency) : 1;
      setQuantity(Math.floor((a * fx) / p).toString());
    }
  };

  const handleQuantityChange = (v: string) => {
    setQuantity(v);
    const p = parseFloat(price);
    const q = parseFloat(v);
    if (!isNaN(q) && !isNaN(p) && p > 0) {
      const fx = position ? fxFor(position.instrument.currency) : 1;
      setAmount(((q * p) / fx).toFixed(2));
    }
  };

  const handlePriceChange = (v: string) => {
    setPrice(v);
    const p = parseFloat(v);
    const a = parseFloat(amount);
    if (!isNaN(a) && !isNaN(p) && p > 0) {
      const fx = position ? fxFor(position.instrument.currency) : 1;
      setQuantity(Math.floor((a * fx) / p).toString());
    }
  };

  const handleConfirm = () => {
    const amountNum = parseFloat(amount) || 0;
    const quantityNum = parseFloat(quantity) || 0;
    const priceNum = parseFloat(price) || 0;
    
    if (amountNum > 0 && quantityNum > 0 && priceNum > 0) {
      onConfirm(amountNum, quantityNum, priceNum, notes, date);
      resetForm();
    }
  };

  const resetForm = () => {
    setAmount('');
    setQuantity('');
    setPrice('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    setUseSuggested(false);
    setSellAll(false);
  };

  if (!position) return null;

  const suggestedSell = Math.abs(Math.min(0, position.suggestedTradeEur));
  const maxQuantity = position.position.quantity || 0;
  const maxValue = position.position.marketValueEur;
  const requestedQty = parseFloat(quantity) || 0;
  const exceedsMax = requestedQty > maxQuantity;
  const isNonEur = position.instrument.currency !== 'EUR';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-600" />
            Diminuisci Posizione
          </DialogTitle>
          <DialogDescription>
            {position.instrument.name} ({position.instrument.ticker})
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Quantità posseduta:</span>
            <span className="font-mono font-medium">{maxQuantity.toLocaleString('it-IT')} ({maxValue.toLocaleString('it-IT')} EUR)</span>
          </div>

          {suggestedSell > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <Checkbox 
                id="use-suggested" 
                checked={useSuggested}
                onCheckedChange={(checked) => {
                  setUseSuggested(checked as boolean);
                  if (checked) setSellAll(false);
                }}
              />
              <Label htmlFor="use-suggested" className="text-sm cursor-pointer">
                Usa trade suggerito: <span className="font-mono font-medium">-€{suggestedSell.toLocaleString('it-IT')}</span>
              </Label>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="sell-all" 
              checked={sellAll}
              onCheckedChange={(checked) => {
                setSellAll(checked as boolean);
                if (checked) setUseSuggested(false);
              }}
            />
            <Label htmlFor="sell-all" className="text-sm cursor-pointer">
              Vendi tutto
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Importo (EUR)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                disabled={sellAll}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantità</Label>
              <Input
                id="quantity"
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="0"
                disabled={sellAll}
              />
            </div>
          </div>

          {exceedsMax && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                La quantità richiesta supera quella posseduta. Vuoi vendere tutto?
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Prezzo unitario ({position.instrument.currency})</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data operazione</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {isNonEur && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground p-2 bg-secondary/40 rounded">
              <Info className="h-3.5 w-3.5 mt-0.5" />
              <span>Cambio applicato: 1 EUR = {fxFor(position.instrument.currency)} {position.instrument.currency}.</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note opzionali..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button 
            variant="destructive"
            onClick={handleConfirm}
            disabled={!amount || !quantity || !price || parseFloat(amount) <= 0 || exceedsMax}
          >
            Conferma Vendita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}