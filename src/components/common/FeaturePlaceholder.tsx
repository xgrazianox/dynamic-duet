import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';

/**
 * Placeholder neutro per funzionalità non ancora collegate ai dati reali.
 * Nessuna CTA che finga una funzione non disponibile (correzione A/§2 direzione).
 */
export function FeaturePlaceholder({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

export const SIGNAL_ENGINE_PLACEHOLDER =
  'Signal Engine non ancora collegato ai dati reali — disponibile in F3';
export const INPUTS_PLACEHOLDER =
  'Gestione di prezzi e cambi reali disponibile in F3';
export const TARGETS_PLACEHOLDER =
  'Configurazione dei target strategici disponibile in F3';
