import { authStore } from '@/lib/auth-store';
import { ApiError, http } from '@/lib/http';

let restoring: Promise<void> | null = null;

/**
 * On first load the access token is gone (memory only), but the refresh cookie may
 * still be valid. Runs one refresh to find out; later calls reuse the same promise.
 * Without an answer the question stays open: this throws (the root shows "No connection",
 * not the login page) and the next call asks again.
 */
export function ensureSessionRestored(): Promise<void> {
  if (authStore.getState().status !== 'unknown') return Promise.resolve();
  restoring ??= http.refreshSession().then(() => {
    if (authStore.getState().status !== 'unknown') return;
    restoring = null;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  });
  return restoring;
}

/** Test helper. */
export function resetSessionRestore() {
  restoring = null;
}
