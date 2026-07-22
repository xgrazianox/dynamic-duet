import { useAppState } from '@/contexts/AppStateContext';
import { Alert } from '@/types/portfolio';

/**
 * Blocco D (F2): restituisce solo gli alert dello stato UI.
 * Gli alert DINAMICI (deviazione dai target, take-profit…) derivavano da posizioni
 * e regime mock: sono rinviati alla F5, quando saranno calcolati dalla proiezione
 * reale del ledger e dai target confermati. Nessun output mock in modalità reale.
 */
export function useAllAlerts(): Alert[] {
  const { alerts } = useAppState();
  return alerts;
}
