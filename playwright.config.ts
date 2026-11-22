import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de parcours en mode démo (faux client Supabase en mémoire : rien n'est
 * écrit, chaque page repart des mêmes données).
 *
 * Par défaut : `next dev` sur un port dédié. `E2E_BUILD=1` sert un build de
 * production (`next build` + `next start`), plus lent à démarrer mais plus
 * proche de ce qui tourne en ligne ; c'est ce que fait la CI.
 */
const PORT = Number(process.env.E2E_PORT || 3217)
const BASE_URL = `http://localhost:${PORT}`
const prod = process.env.E2E_BUILD === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'bureau', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: prod
      ? `npm run build && npx next start -p ${PORT}`
      : `npx next dev -p ${PORT}`,
    url: BASE_URL,
    env: { NEXT_PUBLIC_DEMO: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: prod ? 300_000 : 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
