import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MigrationWizard } from './MigrationWizard';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Gate: se l'utente è loggato ma migration_completed=false, mostra il wizard.
 * Se non loggato → /auth. Altrimenti passa i children.
 */
export function MigrationGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const [migrated, setMigrated] = useState<boolean | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (!user) { setMigrated(null); return; }
    (async () => {
      const { data: pf } = await supabase.from('portfolios').select('id').eq('user_id', user.id).maybeSingle();
      if (!pf) { setMigrated(false); return; }
      const { data: st } = await supabase.from('portfolio_settings').select('migration_completed').eq('portfolio_id', pf.id).maybeSingle();
      setMigrated(!!st?.migration_completed);
    })();
  }, [user, refetchTick]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  if (migrated === null) return null;
  if (!migrated) {
    return (
      <div className="min-h-screen bg-background p-6">
        <MigrationWizard onDone={() => setRefetchTick((n) => n + 1)} />
      </div>
    );
  }
  return <>{children}</>;
}