import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Transaction, TransactionType, Instrument } from '@/types/portfolio';
import { toast } from 'sonner';

interface TransactionFormProps {
  instruments: Instrument[];
  onSubmit: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => void;
  defaultType?: TransactionType;
}

export function TransactionForm({ instruments, onSubmit, defaultType = 'BUY' }: TransactionFormProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>(defaultType);
  const [instrumentId, setInstrumentId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState<string>('');
  const [pricePerUnit, setPricePerUnit] = useState<string>('');
  const [fees, setFees] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const selectedInstrument = instruments.find(i => i.id === instrumentId);
  const totalValue = Number(quantity) * Number(pricePerUnit);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!instrumentId || !quantity || !pricePerUnit) {
      toast.error('Compila tutti i campi obbligatori');
      return;
    }

    const transaction: Omit<Transaction, 'id' | 'createdAt'> = {
      instrumentId,
      sleeveKey: selectedInstrument?.sleeveKey || '',
      type,
      date,
      quantity: Number(quantity),
      pricePerUnit: Number(pricePerUnit),
      totalValueEur: totalValue,
      fees: fees ? Number(fees) : undefined,
      notes: notes || undefined,
    };

    onSubmit(transaction);
    toast.success(`${type === 'BUY' ? 'Acquisto' : 'Vendita'} registrato con successo`);
    
    // Reset form
    setInstrumentId('');
    setQuantity('');
    setPricePerUnit('');
    setFees('');
    setNotes('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={defaultType === 'BUY' ? 'success' : 'warning'}>
          {defaultType === 'BUY' ? (
            <>
              <Plus className="h-4 w-4" />
              Registra Acquisto
            </>
          ) : (
            <>
              <Minus className="h-4 w-4" />
              Registra Vendita
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {type === 'BUY' ? 'Registra Acquisto' : 'Registra Vendita'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'BUY' ? 'success' : 'outline'}
              className="flex-1"
              onClick={() => setType('BUY')}
            >
              <Plus className="h-4 w-4" />
              Acquisto
            </Button>
            <Button
              type="button"
              variant={type === 'SELL' ? 'warning' : 'outline'}
              className="flex-1"
              onClick={() => setType('SELL')}
            >
              <Minus className="h-4 w-4" />
              Vendita
            </Button>
          </div>

          {/* Instrument Select */}
          <div className="space-y-2">
            <Label htmlFor="instrument">Strumento *</Label>
            <Select value={instrumentId} onValueChange={setInstrumentId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona strumento" />
              </SelectTrigger>
              <SelectContent>
                {instruments.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name} ({inst.ticker})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Data *</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Quantity and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantità *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Prezzo unitario (€) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
              />
            </div>
          </div>

          {/* Fees */}
          <div className="space-y-2">
            <Label htmlFor="fees">Commissioni (€)</Label>
            <Input
              id="fees"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </div>

          {/* Total */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Totale operazione:</span>
              <span className="text-xl font-bold font-mono">
                €{(totalValue + Number(fees || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Input
              id="notes"
              placeholder="Note opzionali..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button 
            type="submit" 
            className="w-full"
            variant={type === 'BUY' ? 'success' : 'warning'}
          >
            Conferma {type === 'BUY' ? 'Acquisto' : 'Vendita'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}