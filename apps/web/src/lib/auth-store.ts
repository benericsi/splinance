import type { User } from '@splinance/shared';
import { useSyncExternalStore } from 'react';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Why the last session ended. After an explicit logout (or deleting the account) the next
 * person on this browser may be someone else, so the login page must not send them back
 * to the previous page.
 */
export type SessionEnd = 'logout' | 'expired' | 'deleted';

/** Ended on purpose: start fresh at /login instead of returning to the last page. */
export function endedOnPurpose(endedBy: SessionEnd | null): boolean {
  return endedBy === 'logout' || endedBy === 'deleted';
}

export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
  endedBy: SessionEnd | null;
}

const initialState: AuthState = {
  status: 'unknown',
  accessToken: null,
  user: null,
  endedBy: null,
};

export interface AuthStore {
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
  setSession: (accessToken: string, user: User) => void;
  /** Replaces the signed-in user's details (after a rename); no-op when signed out. */
  setUser: (user: User) => void;
  /** Ends the session; `expired` (default) for failed refreshes, `logout` when asked to. */
  clear: (reason?: SessionEnd) => void;
}

/**
 * Access token and current user, kept in memory only (never localStorage).
 * Lives outside React so the HTTP client, router guards and loaders can read it.
 */
function createAuthStore(): AuthStore & { reset: () => void } {
  let state = initialState;
  const listeners = new Set<() => void>();

  const set = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => {
      listener();
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSession: (accessToken, user) => {
      set({ status: 'authenticated', accessToken, user, endedBy: null });
    },
    setUser: (user) => {
      if (state.status === 'authenticated') set({ ...state, user });
    },
    clear: (reason = 'expired') => {
      // A request that fails after a logout or a deletion (a page still refetching while
      // the router leaves it) must not turn that end into "expired".
      if (state.status === 'anonymous' && reason === 'expired' && endedOnPurpose(state.endedBy)) {
        return;
      }
      set({ status: 'anonymous', accessToken: null, user: null, endedBy: reason });
    },
    reset: () => {
      set(initialState);
    },
  };
}

export const authStore = createAuthStore();

/** Test helper: back to the initial "unknown" state. */
export function resetAuthStore() {
  authStore.reset();
}

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.getState);
}
