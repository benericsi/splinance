import { authStore } from '@/lib/auth-store';
import { http } from '@/lib/http';

let restoring: Promise<void> | null = null;

/**
 * On first load the access token is gone (memory only), but the refresh cookie may
 * still be valid. Runs one refresh to find out; later calls reuse the same promise.
 */
export function ensureSessionRestored(): Promise<void> {
  if (authStore.getState().status !== 'unknown') return Promise.resolve();
  restoring ??= http.refreshSession().then(() => undefined);
  return restoring;
}

/** Test helper. */
export function resetSessionRestore() {
  restoring = null;
}
