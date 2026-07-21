import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

export default function AuthPage() {
  const { user, loading } = useCurrentUser();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const { error } = await fn.call(supabase.auth, {
        email, password,
        options: mode === 'signup' ? { emailRedirectTo: `${window.location.origin}/` } : undefined,
      } as never);
      if (error) throw error;
      toast({ title: mode === 'signin' ? 'Accesso effettuato' : 'Registrazione completata' });
    } catch (err) {
      toast({ title: 'Errore', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>{mode === 'signin' ? 'Accedi' : 'Registrati'}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? '...' : (mode === 'signin' ? 'Accedi' : 'Crea account')}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}