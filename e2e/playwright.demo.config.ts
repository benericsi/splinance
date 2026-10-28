import { defineConfig, devices } from '@playwright/test';
import { DEMO_API_PORT, DEMO_WEB_PORT, E2E_DEMO_DATABASE_URL } from './support/env';

const CI = Boolean(process.env.CI);

/**
 * The demo instance: the bundled API with DEMO_MODE on :3200 against splinance_e2e_demo, and
 * the demo build of the web app (`build:demo`, dist-demo) on :4273. Its own ports, database
 * and output folders, so it runs next to the main suite and `pnpm dev`.
 */
export default defineConfig({
  testDir: './demo',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  ...(CI && { workers: 2 }),
  outputDir: 'test-results/demo',
  reporter: CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/demo' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/demo' }]],
  globalSetup: './support/global-setup.demo.ts',

  use: {
    baseURL: `http://localhost:${String(DEMO_WEB_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      testIgnore: /\.mobile\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testMatch: /\.mobile\.spec\.ts$/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  // Like the main suite: the API connects lazily and /health/live does not touch the database.
  webServer: [
    {
      command: 'node dist/index.mjs',
      cwd: '../apps/api',
      url: `http://localhost:${String(DEMO_API_PORT)}/api/health/live`,
      env: {
        NODE_ENV: 'test',
        PORT: String(DEMO_API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DEMO_DATABASE_URL,
        JWT_ACCESS_SECRET: 'e2e-demo-secret-that-is-at-least-32-characters',
        COOKIE_SECURE: 'false',
        RATE_LIMIT_DISABLED: 'true',
        DEMO_MODE: 'true',
      },
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @splinance/web exec vite preview --outDir dist-demo --port ${String(DEMO_WEB_PORT)}`,
      url: `http://localhost:${String(DEMO_WEB_PORT)}`,
      env: { API_PROXY_TARGET: `http://localhost:${String(DEMO_API_PORT)}` },
      reuseExistingServer: false,
    },
  ],
});
