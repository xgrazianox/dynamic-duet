# Test utilities (NON distribuibili)

Governance permanente stabilita durante la chiusura F1:

**Nessuna migration applicativa** sotto `supabase/migrations/` può:
- disabilitare il trigger append-only su `public.operations`
  (`ALTER TABLE ... DISABLE TRIGGER ...`);
- eseguire `DELETE` su `auth.users` o su dati utente per pulizie di test.

Qualsiasi SQL di pulizia fixture/E2E va qui, eseguito manualmente
con la service_role e mai committato come migration.

## Migrazioni storiche non conformi (già applicate)

Le seguenti migration sono già registrate nel cloud e NON vanno
riscritte retroattivamente (rewrite silenzioso della history = vietato):

- `20260721220018_*.sql` — cleanup fixture con DISABLE TRIGGER.
- `20260722000900_*.sql` — cleanup portfolio fixture con DISABLE TRIGGER.
- `20260722014743_*.sql` — cleanup utenti E2E con DELETE su auth.users.
- `20260722014754_*.sql` — DELETE auth.users f1a_%.

Riconciliazione sicura proposta: lasciare la history intatta, applicare
d'ora in avanti la regola sopra e canalizzare ogni cleanup qui.
