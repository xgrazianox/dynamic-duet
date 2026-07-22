import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MigrationWizard } from './MigrationWizard';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * Gate: gestisce onboarding (migration_completed=false) e riapertura wizard
 * in modalità amend finché la finestra di correzione è aperta (opening
 * presenti ma nessuna operazione ordinaria). Ingresso UI minimo: un banner
 * sticky con il pulsante "Correggi importazione".
 */
export function MigrationGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const [migrated, setMigrated] = useState<boolean | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);
  const [canAmend, setCanAmend] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!user) { setMigrated(null); return; }
    (async () => {
      const { data: pf } = await supabase.from('portfolios').select('id').eq('user_id', user.id).maybeSingle();
      if (!pf) { setMigrated(false); return; }
      const { data: st } = await supabase.from('portfolio_settings').select('migration_completed').eq('portfolio_id', pf.id).maybeSingle();
      const done = !!st?.migration_completed;
      if (done) {
        try {
          sessionStorage.removeItem(`migration:batchKey:import:${user.id}:${pf.id}`);
        } catch { /* sessionStorage non disponibile: no-op */ }
        const { data: ops } = await supabase.from('operations_v')
          .select('op_type').eq('portfolio_id', pf.id);
        const rows = ops ?? [];
        const hasOrdinary = rows.some((o) => ['BUY','SELL','DEPOSIT','WITHDRAW','DIVIDEND','OTHER_INCOME','FEE'].includes(o.op_type));
        const hasOpenings = rows.some((o) => o.op_type === 'OPENING_POSITION' || o.op_type === 'OPENING_CASH');
        setCanAmend(hasOpenings && !hasOrdinary);
      } else {
        setCanAmend(false);
      }
      setMigrated(done);
    })();
  }, [user, refetchTick]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  if (migrated === null) return null;
  if (!migrated || amendOpen) {
    return (
      <div className="min-h-screen bg-background p-6">
        <MigrationWizard onDone={() => { setAmendOpen(false); setRefetchTick((n) => n + 1); }} />
      </div>
    );
  }
  return (
    <>
      {canAmend && (
        <div className="sticky top-0 z-40 border-b border-border bg-amber-500/10 px-4 py-2 flex items-center justify-between gap-4">
          <div className="text-sm">
            <strong>Finestra di correzione aperta:</strong> puoi ancora correggere l'importazione iniziale finché non registri operazioni ordinarie.
          </div>
          <Button size="sm" variant="outline" onClick={() => setAmendOpen(true)}>
            Correggi importazione
          </Button>
        </div>
      )}
      {children}
    </>
  );
}