import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/test-db';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
    },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
