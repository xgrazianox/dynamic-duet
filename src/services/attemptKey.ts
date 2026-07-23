/** F6-r2.1 — gestione della chiave di idempotenza PER TENTATIVO.
 * Stessa chiave finché lo STESSO payload viene ritentato (risposta persa);
 * payload diverso → chiave nuova; dopo un successo definitivo il tentativo si
 * chiude: un futuro salvataggio, anche con contenuto già usato, ha chiave nuova. */
export interface AttemptTracker {
  keyFor(payload: unknown): string;
  complete(): void;
}
export function createAttemptTracker(): AttemptTracker {
  let key: string | null = null;
  let payloadJson: string | null = null;
  return {
    keyFor(payload: unknown): string {
      const j = JSON.stringify(payload); // serializzazione COMPLETA (ricorsiva)
      if (key === null || payloadJson !== j) {
        key = crypto.randomUUID();
        payloadJson = j;
      }
      return key;
    },
    complete() { key = null; payloadJson = null; },
  };
}
