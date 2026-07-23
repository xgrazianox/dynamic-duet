import { defineConfig } from '@playwright/test';

/**
 * F6 — Suite E2E. Gira contro un deploy reale (preview Lovable o `vite preview`).
 * Configurazione SOLO via variabili d'ambiente — nessuna credenziale nel repo:
 *   E2E_BASE_URL   es. https://<preview>.lovable.app  (default http://localhost:4173)
 *   E2E_EMAIL      account DEDICATO e2e-f6-…  (MAI l'account titolare)
 *   E2E_PASSWORD   password dell'account di test
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1, // i test condividono lo stato dell'account e2e: seriali
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
