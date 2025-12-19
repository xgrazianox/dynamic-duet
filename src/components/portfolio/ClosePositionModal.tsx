import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';

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
  };
  lastPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

interface ClosePositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: EnrichedPosition | null;
  onConfirm: (notes: string, date: string) => void;
}

export function ClosePositionModal({ open, onOpenChange, position, onConfirm }: ClosePositionModalProps) {
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleConfirm = () => {
    onConfirm(notes, date);
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  if (!position) return null;

  const plColor = position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <X className="h-5 w-5" />
            Chiudi Posizione
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Stai per chiudere completamente la posizione su <strong>{position.instrument.name}</strong> ({position.instrument.ticker}).
              </p>
              
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Quantità</p>
                  <p className="font-mono font-medium">{position.position.quantity?.toLocaleString('it-IT') || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valore attuale</p>
                  <p className="font-mono font-medium">€{position.position.marketValueEur.toLocaleString('it-IT')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prezzo medio acq.</p>
                  <p className="font-mono font-medium">€{position.position.averageBuyPrice?.toFixed(2) || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">P/L non realizzato</p>
                  <p className={`font-mono font-medium ${plColor}`}>
                    {position.unrealizedPL >= 0 ? '+' : ''}€{position.unrealizedPL.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                    <span className="text-xs ml-1">
                      ({position.unrealizedPLPercent >= 0 ? '+' : ''}{position.unrealizedPLPercent.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="close-date">Data chiusura</Label>
                  <Input
                    id="close-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="close-notes">Note</Label>
                  <Textarea
                    id="close-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Motivo della chiusura..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Chiudi Posizione
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}