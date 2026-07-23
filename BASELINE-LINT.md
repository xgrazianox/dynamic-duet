# Baseline Lint — Fase 0

Snapshot ESLint eseguito il 2026-07-21 con `npm run lint` allo stato iniziale
della Fase 0. Questi errori/warning esistevano PRIMA della riprogettazione
contabile e sono la baseline autorizzata: nessun nuovo errore può essere
introdotto nelle fasi F1–F6, e la baseline deve essere azzerata entro la F6.

**Totale: 19 problemi (7 errori, 12 warning).**

## Errori (7)

| File | Riga | Regola |
|---|---|---|
| src/components/dashboard/AllocationComparisonChart.tsx | 53 | @typescript-eslint/no-explicit-any |
| src/components/dashboard/AllocationComparisonChart.tsx | 58 | @typescript-eslint/no-explicit-any |
| src/components/ui/command.tsx | 24 | @typescript-eslint/no-empty-object-type |
| src/components/ui/textarea.tsx | 5 | @typescript-eslint/no-empty-object-type |
| src/lib/alertRouting.ts | 8 | @typescript-eslint/no-explicit-any |
| src/pages/PortfolioPage.tsx | 150 | prefer-const |
| tailwind.config.ts | 104 | @typescript-eslint/no-require-imports |

## Warning (12)

| File | Riga | Regola |
|---|---|---|
| src/components/ui/badge.tsx | 29 | react-refresh/only-export-components |
| src/components/ui/button.tsx | 58 | react-refresh/only-export-components |
| src/components/ui/form.tsx | 129 | react-refresh/only-export-components |
| src/components/ui/navigation-menu.tsx | 111 | react-refresh/only-export-components |
| src/components/ui/sidebar.tsx | 636 | react-refresh/only-export-components |
| src/components/ui/sonner.tsx | 27 | react-refresh/only-export-components |
| src/components/ui/toggle.tsx | 37 | react-refresh/only-export-components |
| src/contexts/AppStateContext.tsx | 80 | react-refresh/only-export-components |
| src/contexts/SignalEngineContext.tsx | 10 (×3) | react-refresh/only-export-components |
| src/contexts/SignalEngineContext.tsx | 70 | react-refresh/only-export-components |

## Delta rispetto al conteggio audit (16 problemi: 7 err, 9 warn)

I 3 warning "aggiuntivi" (12 vs 9) sono TUTTI sulla riga 10 di
`src/contexts/SignalEngineContext.tsx`, che dichiara tre named export non
componente sulla STESSA riga:
`export { SignalEngineContext, SignalEngineProvider, useSignalEngine }`.
La regola `react-refresh/only-export-components` emette una violazione per
ciascun symbol non-componente esportato: qui produce 3 report distinti (col 10,
30, 50). L'audit li deduplica per file/linea a 1 warning; ESLint li conta
separatamente, portando il totale a 12 anziché 9. Nessuna nuova regola,
nessun nuovo file lintato. I 7 errori restano identici prima e dopo F0.

## Conferma "no new errors" introdotti dalla Fase 0

F0 ha creato/modificato solo: `vitest.config.ts`, `src/test/setup.ts`,
`src/test/smoke.test.ts`, `tsconfig.app.json`, `package.json`,
`BASELINE-LINT.md`. Nessuno di questi file compare nell'output di ESLint. La
distribuzione degli errori/warning per file è invariata rispetto all'audit.

## Strategia di test futura (F1+)

- **RPC + vincoli DB**: test SQL/pgTAP-style via `supabase--read_query` che
  esercitano ogni CHECK per `op_type`, gli indici parziali (attivo singolo,
  riga cash unica) e i trigger append-only. Ogni RPC di F1 avrà test happy
  path + rigetto (idempotency conflict, payload_hash mismatch, cash negativo
  a replay, quantità negativa, strumento archiviato/senza prezzo, valuta
  senza fx confermato).
- **RLS**: fixture con due utenti; verifica che B non veda mai dati di A su
  tutte le tabelle esposte in select; verifica che le insert dirette client
  su operations / target_sets / target_allocations / regime_decisions /
  mutation_requests siano NEGATE con RLS attivo, anche via `supabase-js`.
- **Concorrenza**: due chiamate parallele con stessa `idempotency_key` →
  UNIQUE su `mutation_requests` blocca la seconda, il risultato salvato
  viene restituito; con `payload_hash` diverso → errore esplicito.
- **Dominio puro** (F1+): `src/domain/*` (ledgerReplay, positions, pnl,
  dietz, valuation, rebalance, signalEngine) coperto da unit test Vitest
  senza dipendenze React o browser (compat runtime Deno).
- **Signal Engine end-to-end**: golden test su serie di coppie mensili
  allineate → verifica soglia `mesi_richiesti`, comportamento "dati
  insufficienti", persistenza tramite Edge Function e doppio controllo
  actor–portfolio nella RPC service_role.
---

## Aggiornamento Blocco B-BIS (2026-07-22)

- Baseline F0 conservata: 7 errori / 12 warning.
- Stato corrente atteso: **massimo 6 errori / 12 warning** (Δ = −1 err).
- Regola: la baseline può solo diminuire; nessuna regressione.
- Snapshot corrente: **18 problemi (6 errori / 12 warning)** — PASS.
- Correzioni:
  - Split di `OperationModalContext.tsx` (nuovo `operationModalStore.ts`): elimina 1 warning `react-refresh` introdotto dal Blocco A.
  - `PortfolioPage.tsx`: `ledger` avvolto in `useMemo`: elimina 2 warning `react-hooks/exhaustive-deps` introdotti dal Blocco B.
- ESLint grezzo continuerà legittimamente a restituire exit 1 finché esistono i 6 errori baseline; il confronto formalizzato (≤ 6 err / ≤ 12 warn) restituisce PASS.

## Chiusura F6-r2 — baseline azzerata

`eslint .` → **exit 0, 0 errori, 0 warning** (2026-07-23). I 6 errori storici
sono stati corretti realmente (empty-interface → type alias in ui/command e
ui/textarea; `any` tipizzato in alertRouting; import ESM in tailwind.config;
AllocationComparisonChart eliminato perché privo di consumatori). I warning
react-refresh dei file shadcn/ui sono chiusi con una configurazione PUNTUALE
e documentata in eslint.config.js (export costanti/varianti/hook stabili,
sicuri per design). Da qui in avanti la baseline autorizzata è ZERO.
