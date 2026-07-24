import { test, expect } from '@playwright/test';
import { login, completeOpeningIfPresent, expectHeading, seedDepositIfEmpty } from './helpers';

/**
 * SMOKE — deterministico su QUALSIASI stato dell'account e2e:
 * login + ogni pagina si apre e mostra la propria intestazione reale.
 * Unica mutazione possibile: l'inizializzazione minima al PRIMO accesso
 * (apertura wizard + versamento seed se il portafoglio e' vuoto, come da README);
 * dai run successivi nessuna mutazione.
 */
test.describe('smoke di navigazione', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await completeOpeningIfPresent(page);
  });

  test('dashboard', async ({ page }) => {
    await seedDepositIfEmpty(page); // la sezione "Regime di mercato" esiste solo a portafoglio non vuoto
    await page.goto('/');
    await expectHeading(page, /dashboard/i);
    await expect(page.getByText(/regime di mercato/i)).toBeVisible();
  });

  test('portfolio + tab piano di ribilanciamento', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page.getByRole('tab', { name: /piano di ribilanciamento/i })).toBeVisible();
    await page.getByRole('tab', { name: /piano di ribilanciamento/i }).click();
    // Ancorata: "Regime applicabile: …" (il messaggio "…nessun regime applicabile…" non deve contare)
    await expect(page.getByText(/^regime applicabile/i)).toBeVisible();
    // La colonna Target NON deve esistere nella tabella Posizioni (hotfix F5)
    await page.getByRole('tab', { name: /posizioni/i }).click();
    await expect(page.getByRole('columnheader', { name: /^target$/i })).toHaveCount(0);
  });

  test('strumenti & prezzi', async ({ page }) => {
    await page.goto('/inputs');
    await expectHeading(page, /strumenti\s*&\s*prezzi/i);
    await expect(page.getByRole('tab', { name: /cambi/i })).toBeVisible();
  });

  test('signal engine', async ({ page }) => {
    await page.goto('/signals');
    await expectHeading(page, /signal engine/i);
    await expect(page.getByRole('button', { name: /valuta regime/i })).toBeVisible();
  });

  test('target risk-on / risk-off', async ({ page }) => {
    await page.goto('/risk-on');
    await expectHeading(page, /target risk-on/i);
    await page.goto('/risk-off');
    await expectHeading(page, /target risk-off/i);
  });

  test('alert (reali, senza "Segna risolto")', async ({ page }) => {
    await page.goto('/alerts');
    await expectHeading(page, /alert/i);
    await expect(page.getByText(/parametri attivi/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /segna risolto/i })).toHaveCount(0);
  });

  test('rendimenti', async ({ page }) => {
    await page.goto('/performance');
    await expectHeading(page, /rendimenti/i);
    await expect(page.getByText(/modified dietz/i).first()).toBeVisible();
  });

  test('impostazioni (reali)', async ({ page }) => {
    await page.goto('/settings');
    await expectHeading(page, /impostazioni/i);
    await expect(page.getByLabel(/tolleranza deviazione/i)).toBeVisible();
    await expect(page.getByText(/dalla prossima valutazione/i)).toBeVisible();
  });
});
