import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * The built images behind Caddy (deploy/compose.smoke.yml), the way Railway serves them: the
 * real Caddyfile, CSP and security headers, both hosts. Nothing is started here; the stack
 * must be up (CI job "Images and smoke", or docs/deploy.md for a local run).
 */
export default defineConfig({
  testDir: './smoke',
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  outputDir: 'test-results/smoke',
  reporter: CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/smoke' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/smoke' }]],
  use: {
    // The suites read English text; without this the browser follows the machine's language.
    locale: 'en-US',
    baseURL: process.env.SMOKE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
