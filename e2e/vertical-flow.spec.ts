import { test, expect } from '@playwright/test';
import { login, completeOpeningIfPresent } from './helpers';

/**
 * FLUSSO VERTICALE (punto 6 F3 + F5) — richiede un account e2e-f6 FRESCO
 * (bootstrap seed, apertura completata/saltata). Ordine seriale obbligato.
 * Serie prezzi identica al collaudo F3 (verificata: 15 mesi → RISK-ON determinato).
 */
const MONTHS = ['2025-04-30','2025-05-31','2025-06-30','2025-07-31','2025-08-31','2025-09-30','2025-10-31','2025-11-30','2025-12-31','2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31','2026-06-30'];
const WORLDCORE = [100,102.2,104.45,106.75,109.09,111.49,113.95,116.45,119.02,121.63,124.31,127.05,129.84,132.7,135.62];
const csvOf = (prices: number[]) => MONTHS.map((m, i) => `${m};${prices[i]}`).join('\n');

test.describe.serial('flusso verticale prezzo → regime → target → dashboard → piano', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await completeOpeningIfPresent(page);
  });

  test('1. import CSV prezzi driver (WORLDCORE e GOLD)', async ({ page }) => {
    await page.goto('/inputs');
    await page.getByRole('tab', { name: /prezzi/i }).click();
    for (const [label, csv] of [['WORLDCORE', csvOf(WORLDCORE)], ['GOLD', csvOf(MONTHS.map(() => 50))]] as const) {
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: new RegExp(label) }).click();
      await page.getByRole('textbox', { name: /import csv|csv/i }).or(page.locator('textarea')).fill(csv);
      await page.getByRole('button', { name: /importa csv/i }).click();
      await expect(page.getByText(/15 prezzi importati/i)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('2. valuta regime → decisione persistita RISK-ON', async ({ page }) => {
    await page.goto('/signals');
    await page.getByRole('button', { name: /valuta regime/i }).click();
    await expect(page.getByText(/regime valutato: risk-on/i)).toBeVisible({ timeout: 30_000 });
    // La card "Decisione persistita" non deve piu' mostrare lo stato vuoto:
    // dopo l'invalidazione della query compare il badge del regime persistito.
    await expect(page.getByRole('heading', { name: /decisione persistita/i })).toBeVisible();
    await expect(page.getByText(/nessuna decisione persistita/i)).toHaveCount(0, { timeout: 15_000 });
  });

  test('3. conferma target Risk-On → versione attiva; doppio salvataggio non duplica', async ({ page }) => {
    await page.goto('/risk-on');
    const save = page.getByRole('button', { name: /salva versione/i });
    const noChanges = page.getByText(/nessuna modifica rispetto alla versione attiva/i);
    // Editor caricato: la riga Cash e' sempre presente nel target
    await expect(page.getByText(/cash \(liquidità\)/i)).toBeVisible({ timeout: 15_000 });
    if (await noChanges.isVisible()) {
      // Run ripetuto: la conferma e' gia' avvenuta in un run precedente.
      // L'esito idempotente E' lo stato atteso: una versione attiva nello storico,
      // salvataggio disabilitato (nessuna nuova versione verrebbe creata).
      await expect(save).toBeDisabled();
      await expect(page.getByText(/^attiva$/)).toBeVisible(); // badge nello storico: una sola attiva per regime
      return;
    }
    await save.click();
    await expect(page.getByText(/versione \d+ attiva/i)).toBeVisible({ timeout: 15_000 });
    // idempotenza UI: senza modifiche il pulsante si disabilita
    await expect(save).toBeDisabled();
    await expect(noChanges).toBeVisible();
  });

  test('4. dashboard mostra la decisione persistita', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/RISK-ON/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('5. piano di ribilanciamento: regime applicabile RISK-ON, blocco dichiarato (fail-explicit)', async ({ page }) => {
    await page.goto('/portfolio?tab=rebalance');
    await expect(page.getByText(/regime applicabile:\s*risk-on/i)).toBeVisible({ timeout: 15_000 });
    // Il target RISK-ON di default ha 10 strumenti; questo flusso importa i prezzi
    // dei SOLI driver. Comportamento corretto (principio F5): il piano NON viene
    // calcolato e i motivi sono dichiarati per esteso, mai silenziosamente.
    // (Il percorso "piano calcolabile" con riga cash e' coperto dai golden vitest
    // del dominio rebalance.)
    await expect(page.getByText(/piano non disponibile/i)).toBeVisible();
    await expect(page.getByText(/prezzo mancante/i)).toBeVisible();
  });

  test('6. alert: eventi e condizioni derivano dai dati reali', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText(/parametri attivi/i)).toBeVisible();
    // nessun controllo mock: la pagina non offre "Segna risolto"
    await expect(page.getByRole('button', { name: /segna risolto/i })).toHaveCount(0);
  });
});
