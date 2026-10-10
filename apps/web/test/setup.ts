import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
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

// The first route test in a file loads route chunks cold; on shared CI runners that can
// exceed the default 1 s of findBy*/waitFor (3 s was not enough while the API suite runs in
// parallel). Real failures still fail, just later.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no canvas; household avatars paint on one. Return no context instead of a
// "not implemented" error per render (the avatar library skips drawing without one).
HTMLCanvasElement.prototype.getContext = () => null;

// jsdom has no pointer capture; sonner calls it when a toast (its Undo button) is pressed.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;

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
