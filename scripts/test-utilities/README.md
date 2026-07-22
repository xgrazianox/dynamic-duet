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

## Riconciliazione (F1 closure)

La history NON viene riscritta. Una migration no-op "marker" non neutralizza
file già applicati: qualsiasi ambiente futuro che rieseguisse il set le
ripercorrerebbe comunque. Difesa in profondità applicata:

1. **Allowlist con hash** (`nonconformant-migrations.allowlist`): registra
   lo sha256 delle 4 migration. `check-migrations.sh` fallisce se un file
   allowlisted viene modificato (rewrite silenzioso vietato) o se una
   *nuova* migration contiene `DISABLE TRIGGER` su `public.operations`,
   `DELETE FROM auth.users`, o pattern `ILIKE` di cleanup utenti.
2. **Replay guard su auth.users**: la CI passa `AUTH_USERS_PRE` (conteggio
   pre-replay). Lo script rilegge il conteggio post-replay e fallisce se
   diminuisce — difesa specifica contro i `DELETE ... ILIKE` delle
   migration `20260722014743/54`.
3. **Version pin di `bootstrap_user_data`**: md5 atteso in
   `bootstrap_user_data.expected.md5`. La CI fallisce su drift silenziosi
   della funzione toccata dalla migration `20260721220018`.

Uso locale:

```bash
AUTH_USERS_PRE=$(psql -tAc "SELECT count(*) FROM auth.users")
bash scripts/test-utilities/check-migrations.sh
```

## Autorizzazione operazioni distruttive

Nessuna cancellazione di dati utente (auth.users o portafogli reali) può
essere eseguita senza un comando preventivo esplicito e testuale
dell'utente titolare. Le risposte dell'assistente NON costituiscono
autorizzazione. Ogni utility di questa cartella logga l'operazione ed
esige verifica separata prima dell'esecuzione.
