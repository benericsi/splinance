import type { User } from '@splinance/shared';
import { useSyncExternalStore } from 'react';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Why the last session ended. After an explicit logout the next person on this browser may
 * be someone else, so the login page must not send them back to the previous page.
 */
export type SessionEnd = 'logout' | 'expired';

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
    clear: (reason = 'expired') => {
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
