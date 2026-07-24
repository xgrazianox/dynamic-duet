# Suite E2E (F6)

Playwright contro un deploy reale (preview Lovable o build locale `vite preview`).
**Nessuna credenziale nel repo**: tutto via variabili d'ambiente.

## Prerequisiti
1. Account **dedicato** `e2e-f6-…` (mai il titolare): l'helper ESIGE il prefisso esatto `e2e-f6-`.
   Non serve registrarlo a mano: se l'accesso fallisce, l'helper lo **registra da solo**
   (percorso "Registrati" del form reale).
   L'apertura minima viene COMPLETATA realmente dall'helper (percorso "blank" del wizard: radio → Avanti → Conferma) se il wizard è presente: lo smoke può quindi effettuare l'inizializzazione minima al primo accesso.
   Se il portafoglio è vuoto, i test che ne hanno bisogno registrano un **versamento seed**
   (€10.000) con il percorso reale della modale operazione: la Dashboard vuota, per design,
   non mostra la sezione regime né il bottone Alert. Dai run successivi nessuna mutazione.
2. Browser Playwright installati: `npx playwright install chromium` (solo la prima volta).

## Esecuzione
```bash
export E2E_BASE_URL="https://<preview>.lovable.app"   # oppure: npm run build && npm run preview → http://localhost:4173
export E2E_EMAIL="e2e-f6-01@esempio.test"
export E2E_PASSWORD="********"

npm run test:e2e            # tutta la suite
npx playwright test e2e/smoke.spec.ts          # solo smoke (nessuna mutazione, qualsiasi stato account)
npx playwright test e2e/vertical-flow.spec.ts  # flusso verticale (richiede account FRESCO)
```

## Cosa copre
- 21 test in 3 file: `smoke.spec.ts`, `vertical-flow.spec.ts`, `f6.spec.ts`.
- `smoke.spec.ts` — login + ogni pagina reale si apre (dashboard, portfolio+tab piano,
  strumenti&prezzi, signals, target, alert, rendimenti, impostazioni); verifica anche
  le assenze volute (colonna Target rimossa, nessun "Segna risolto").
- `vertical-flow.spec.ts` — il flusso end-to-end: import CSV driver → "Valuta regime"
  (Edge Function) → decisione persistita RISK-ON → conferma target v2 (con idempotenza UI)
  → Dashboard → piano di ribilanciamento → alert reali.

## Note
- La serie prezzi del flusso verticale è quella **verificata col motore reale** (15 mesi → RISK-ON determinato).
- I test sono seriali (`workers: 1`): condividono lo stato dell'account e2e.
- L'intera suite è **ri-eseguibile** sullo stesso account: i passi con effetti
  (import prezzi, valutazione regime, conferma target, salvataggio impostazioni)
  sono idempotenti o consapevoli dello stato — al re-run verificano direttamente
  l'esito già raggiunto.
