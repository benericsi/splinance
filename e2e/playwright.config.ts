import { defineConfig, devices } from '@playwright/test';
import { API_PORT, E2E_DATABASE_URL, WEB_PORT } from './support/env';

const CI = Boolean(process.env.CI);

/**
 * Runs against production builds (`pnpm build` first): the bundled API on :3100 and
 * `vite preview` on :4173 proxying /api to it. Ports and database differ from `pnpm dev`
 * (3000/5173, `splinance`), so both can run at the same time.
 */
export default defineConfig({
  testDir: './tests',
  // Every test registers its own users, so tests share nothing and run in parallel.
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Locally Playwright's default: half the CPU cores.
  ...(CI && { workers: 2 }),
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  globalSetup: './support/global-setup.ts',

  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
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

  // Playwright starts these before global setup; the API connects to Postgres lazily, and
  // /api/health/live does not touch the database.
  webServer: [
    {
      command: 'node dist/index.mjs',
      cwd: '../apps/api',
      url: `http://localhost:${String(API_PORT)}/api/health/live`,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DATABASE_URL,
        JWT_ACCESS_SECRET: 'e2e-secret-that-is-at-least-32-characters',
        COOKIE_SECURE: 'false',
        RATE_LIMIT_DISABLED: 'true',
      },
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @splinance/web preview',
      url: `http://localhost:${String(WEB_PORT)}`,
      env: { API_PROXY_TARGET: `http://localhost:${String(API_PORT)}` },
      reuseExistingServer: false,
    },
  ],
});
