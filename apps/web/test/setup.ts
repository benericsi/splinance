import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetSessionRestore } from '@/features/auth/session';
import { resetAuthStore } from '@/lib/auth-store';
import { server } from './msw';

// Any request without a handler fails the test instead of silently hitting the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetAuthStore();
  resetSessionRestore();
});

afterAll(() => {
  server.close();
});
