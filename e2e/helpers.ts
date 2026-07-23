import { type Page, expect } from '@playwright/test';

export function creds() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error('E2E_EMAIL / E2E_PASSWORD non impostate (usa un account e2e-f6-…, MAI il titolare)');
  if (!/e2e-/.test(email)) throw new Error(`E2E_EMAIL "${email}" non sembra un account di test dedicato (atteso pattern e2e-…)`);
  return { email, password };
}

/** Login via form dell'app; attende l'uscita dalla pagina /auth. */
export async function login(page: Page): Promise<void> {
  const { email, password } = creds();
  await page.goto('/auth');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /accedi|login|sign in/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 20_000 });
}

/** Se compare il wizard di apertura (MigrationGate), lo salta/completa col minimo. */
export async function passMigrationGateIfPresent(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /salta|skip|inizia senza|prosegui/i });
  try {
    await skip.waitFor({ state: 'visible', timeout: 3_000 });
    await skip.click();
  } catch { /* gate non presente: ok */ }
}

export async function expectHeading(page: Page, re: RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name: re }).first()).toBeVisible({ timeout: 15_000 });
}
