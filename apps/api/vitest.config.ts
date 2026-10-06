import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/test-db.ts';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Test files share one database and reset it between tests, so they must not run in parallel.
    fileParallelism: false,
  },
});
