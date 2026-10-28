import { onTestFinished } from 'vitest';

/**
 * Renders the rest of the test as the demo site's build. Vitest defines `__DEMO_SITE__`
 * (vite.config.ts) as a global, which builds replace with a literal.
 */
export function setDemoSite() {
  globalThis.__DEMO_SITE__ = true;
  onTestFinished(() => {
    globalThis.__DEMO_SITE__ = false;
  });
}
