import { defineConfig } from '@playwright/test';
import demo from './playwright.demo.config';

/**
 * Records the landing page's media against the demo instance (same servers and database as
 * `e2e:demo`): `pnpm capture:demo`. Not a test suite; run it when the app's look changes and
 * commit the files it writes to apps/web/src/assets/demo.
 */
export default defineConfig({
  ...demo,
  testDir: './capture',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  outputDir: 'test-results/capture',
  reporter: [['list']],
  projects: [{ name: 'capture' }],
});
