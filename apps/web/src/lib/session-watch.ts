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

/**
 * Whenever the signed-in person changes, the query cache goes: when a session ends for any
 * reason (logout, expiry, revocation) and when someone else signs in on the same tab, so
 * nobody sees the previous person's data until each query refetches. Logout, account
 * deletion and the demo's end also clear it themselves. Returns the unsubscribe function.
 */
export function clearCacheOnUserChange(
  auth: AuthStore,
  queryClient: { clear: () => void },
): () => void {
  const initial = auth.getState();
  let previousStatus = initial.status;
  let lastUserId = initial.status === 'authenticated' ? (initial.user?.id ?? null) : null;
  return auth.subscribe(() => {
    const state = auth.getState();
    const ended = previousStatus === 'authenticated' && state.status === 'anonymous';
    const someoneElse =
      state.status === 'authenticated' &&
      state.user !== null &&
      lastUserId !== null &&
      state.user.id !== lastUserId;
    if (ended || someoneElse) queryClient.clear();
    if (state.status === 'authenticated' && state.user) lastUserId = state.user.id;
    previousStatus = state.status;
  });
}
