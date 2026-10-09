import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetSessionRestore } from '@/features/auth/session';
import { resetAuthStore } from '@/lib/auth-store';
import { server } from './msw';

// jsdom has no matchMedia; tests run as a light-mode OS by default.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

// jsdom has no canvas; household avatars paint on one. Return no context instead of a
// "not implemented" error per render (the avatar library skips drawing without one).
HTMLCanvasElement.prototype.getContext = () => null;

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
