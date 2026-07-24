import { type Page, expect } from '@playwright/test';

export function creds() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error('E2E_EMAIL / E2E_PASSWORD non impostate');
  // Prefisso OBBLIGATORIO e2e-f6- (mandato F6-r2): mai il titolare, mai account generici.
  if (!/^e2e-f6-/.test(email)) throw new Error(`E2E_EMAIL "${email}" deve iniziare con "e2e-f6-"`);
  return { email, password };
}

/** Login via form dell'app; attende l'uscita dalla pagina /auth.
 *  Locatori per tipo di input (AuthPage non associa Label e Input via htmlFor/id,
 *  quindi getByLabel non funziona). Se l'accesso fallisce (account e2e non ancora
 *  registrato), passa alla modalita' "Registrati" e crea l'account: la guardia
 *  sul prefisso e2e-f6- resta l'unico account che questa suite puo' toccare. */
export async function login(page: Page): Promise<void> {
  const { email, password } = creds();
  await page.goto('/auth');
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /^accedi$/i }).click();
  try {
    await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 15_000 });
    return; // accesso riuscito
  } catch {
    // Accesso fallito: tentativo di registrazione dell'account e2e dedicato.
  }
  await page.getByRole('button', { name: /registrati/i }).click();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /crea account/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 20_000 });
}

/** Completa DETERMINISTICAMENTE l'apertura minima se il wizard e' attivo:
 *  modalita' "blank" (radio #m-blank) → Avanti → Conferma. Nessun pulsante
 *  "salta" immaginario: e' il percorso reale del MigrationWizard. */
export async function completeOpeningIfPresent(page: Page): Promise<void> {
  const blank = page.locator('#m-blank');
  try {
    await blank.waitFor({ state: 'visible', timeout: 4_000 });
  } catch { return; } // wizard non attivo: apertura gia' completata
  await blank.click();
  await page.getByRole('button', { name: /avanti/i }).click();
  await page.getByRole('button', { name: /^conferma$/i }).click();
  await expect(page.locator('#m-blank')).toHaveCount(0, { timeout: 20_000 });
}

/** Se la Dashboard e' nello stato vuoto (account e2e appena creato), registra un
 *  VERSAMENTO minimo con il percorso reale: bottone "Registra versamento" →
 *  modale operazione → Conferma. Idempotente: a portafoglio non vuoto non fa nulla.
 *  Serve perche' la Dashboard vuota (per design) non mostra la sezione regime
 *  ne' il bottone Alert. */
export async function seedDepositIfEmpty(page: Page): Promise<void> {
  await page.goto('/');
  const seedBtn = page.getByRole('button', { name: /registra versamento/i });
  try {
    await seedBtn.waitFor({ state: 'visible', timeout: 5_000 });
  } catch { return; } // portafoglio non vuoto: nessuna inizializzazione
  await seedBtn.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('0.00').fill('10000'); // Importo (EUR) — unico campo con questo placeholder nel tipo Versamento
  await dialog.getByRole('button', { name: /conferma operazione/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function expectHeading(page: Page, re: RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name: re }).first()).toBeVisible({ timeout: 15_000 });
}
