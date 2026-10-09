import type { AuthStore } from './auth-store';

/**
 * Logout, or a refresh that failed mid-session: re-run route guards so protected pages
 * redirect to /login instead of showing stale content. Returns the unsubscribe function.
 */
export function rerunGuardsOnSessionEnd(
  auth: AuthStore,
  router: { invalidate: () => Promise<void> },
): () => void {
  let previousStatus = auth.getState().status;
  return auth.subscribe(() => {
    const { status } = auth.getState();
    if (previousStatus === 'authenticated' && status === 'anonymous') void router.invalidate();
    previousStatus = status;
  });
}
