## Fase 3 Cloud — Esecuzione migration + deploy Edge Function

Scope: applicare la migration già scritta e presente in repo, deployare `evaluate_regime`, eseguire la conferma minima dei 6 punti. Nessuna modifica al codice applicativo.

### Passi

1. **Applica migration** `supabase/migrations/20260722230000_d64f101e-5efb-47e3-bcec-d39b09f1121e.sql` (392 righe: RPC `save_target_set`, RPC `persist_regime_decision`, trigger `trg_price_points_protected`, `trg_fx_rates_protected`, `trg_instruments_protected`, `trg_instruments_no_delete`) tramite `supabase--migration` passando il contenuto testuale del file. Nessuna riscrittura, nessun tocco alle 4 migration allowlisted.

2. **Governance live schema**: eseguire `bash scripts/test-utilities/governance-live-schema.sh` per validare trigger list aggiornata e attestazioni RPC (SECURITY DEFINER + search_path vuoto + grant corretti).

3. **Verifica artefatto Edge**: `bash scripts/test-utilities/engine-single-source.sh` deve dare PASS (nessuna rigenerazione richiesta, è già allineato). Verificare che i secret `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` siano disponibili all'Edge Function (già presenti in `<secrets>`).

4. **Deploy Edge Function** `evaluate_regime` tramite `supabase--deploy_edge_functions` (verify_jwt=true già configurato in `supabase/config.toml`).

5. **Conferma minima (matrice PASS/FAIL sui 6 punti dell'Addendum)** usando SOLO account `e2e-f3-*`:
   - (1) Migration + governance-live-schema PASS.
   - (2) `save_target_set`: idempotenza per chiave, conflitto payload, validazione somma≠100 / doppio Cash / strumento incompatibile — via `supabase--read_query` + insert su account e2e-f3.
   - (3) Protezione trigger: tentativi di INSERT client con `source='opening'` / `source_batch_id`, UPDATE/DELETE su righe opening/batch, change `currency` su instrument referenziato, archiviazione con peso in target attivo — attesi ERROR.
   - (4) Edge: chiamata anonima → 401 (`supabase--curl_edge_functions` con `Authorization: Bearer <invalid>`); `portfolio_id` difforme → 403; log privi di segreti.
   - (5) Dati insufficienti → nessuna riga in `regime_decisions`; dati sufficienti → decisione persistita; retry stesso fingerprint → nessun duplicato.
   - (6) Flusso UI verticale (prezzi driver → Valuta regime → Dashboard aggiornata → conferma target rimuove "n/d") — validato via chiamate DB/Edge (no Playwright, escluso da scope).

6. **Report finale**: singolo messaggio con matrice PASS/FAIL sui 6 punti e blocchi eventuali. Stop prima di F4.

### Fuori scope
Nessuna modifica a pagine/motore/servizi. Nessun reset cloud. Nessun cleanup E2E obbligatorio. Nessuna Playwright/regressione completa (rinviata a F6).
