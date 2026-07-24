import { test, expect } from '@playwright/test';
import { login, completeOpeningIfPresent, seedDepositIfEmpty } from './helpers';

/** F6-r2 — navigazione 6 aree, mobile, deep-link, settings via RPC, niente campi di sistema. */
test.describe('F6: IA, mobile, settings RPC', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await completeOpeningIfPresent(page);
  });

  test('desktop: sei aree primarie, Alert non in sidebar ma raggiungibile dalla Dashboard', async ({ page }) => {
    await seedDepositIfEmpty(page); // la Dashboard vuota non mostra la sezione regime/Alert
    await page.goto('/');
    const nav = page.getByLabel('Navigazione principale').first();
    for (const name of ['Dashboard', 'Portafoglio', 'Strumenti & Prezzi', 'Rendimenti', 'Impostazioni', 'Signal Engine']) {
      await expect(nav.getByText(name, { exact: false }).first()).toBeVisible();
    }
    await expect(nav.getByText(/regole & alert|^alert$/i)).toHaveCount(0);
    await page.getByRole('link', { name: /^alert$/i }).click();
    await expect(page).toHaveURL(/\/alerts/);
  });

  test('mobile: hamburger drawer, nessuna sidebar fissa', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByLabel('Apri menu di navigazione')).toBeVisible();
    await page.getByLabel('Apri menu di navigazione').click();
    await page.getByRole('link', { name: /portafoglio/i }).click();
    await expect(page).toHaveURL(/\/portfolio/);
  });

  test('deep-link ?tab=rebalance apre direttamente il piano', async ({ page }) => {
    await page.goto('/portfolio?tab=rebalance');
    // Ancorata: "Regime applicabile: …" (il messaggio "…nessun regime applicabile…" non deve contare)
    await expect(page.getByText(/^regime applicabile/i)).toBeVisible({ timeout: 15_000 });
  });

  test('settings: salvataggio via RPC e nessun campo di sistema esposto', async ({ page }) => {
    await page.goto('/settings');
    const tol = page.getByLabel(/tolleranza deviazione/i);
    await tol.fill('0.8');
    await page.getByRole('button', { name: /salva impostazioni/i }).click();
    await expect(page.getByText(/impostazioni salvate|nessuna modifica/i)).toBeVisible({ timeout: 15_000 });
    // scenario che avrebbe rilevato il bug della chiave per-contenuto:
    // secondo salvataggio che modifica SOLO il default FX USD → conferma positiva.
    // Alterna il valore per garantire una modifica reale anche nei re-run.
    const fx = page.getByLabel(/default fx usd/i);
    const cur = await fx.inputValue();
    await fx.fill(cur === '0.93' ? '0.92' : '0.93');
    await page.getByRole('button', { name: /salva impostazioni/i }).click();
    await expect(page.getByText(/impostazioni salvate/i)).toBeVisible({ timeout: 15_000 });
    // campi di sistema MAI esposti
    await expect(page.getByText(/tilt/i)).toHaveCount(0);
    await expect(page.getByText(/last_applied|migration_completed/i)).toHaveCount(0);
  });

  test('tolleranza modificata recepita dal piano (parametro mostrato in /alerts)', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText(/tolleranza:/i)).toBeVisible();
    await expect(page.getByText(/0.8|0,8/).first()).toBeVisible();
  });

  test('modale unico: apertura da Nuova operazione', async ({ page }) => {
    await page.goto('/portfolio');
    await page.getByRole('button', { name: /registra una nuova operazione/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('posizioni: colonne ridotte (verifica statica; apertura drawer coperta a runtime nel momento 2)', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page.getByRole('columnheader', { name: /costo medio/i })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /prezzo att/i })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /^target$/i })).toHaveCount(0);
  });
});
