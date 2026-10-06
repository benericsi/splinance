import type { User } from '@splinance/shared';
import { useSyncExternalStore } from 'react';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
}

const initialState: AuthState = { status: 'unknown', accessToken: null, user: null };

export interface AuthStore {
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
  setSession: (accessToken: string, user: User) => void;
  clear: () => void;
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
      set({ status: 'authenticated', accessToken, user });
    },
    clear: () => {
      set({ status: 'anonymous', accessToken: null, user: null });
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
