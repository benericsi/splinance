import { DEFAULT_PREFERENCES, type Preferences } from '@splinance/shared';
import { authStore, useAuth } from '@/lib/auth-store';

/**
 * The signed-in person's defaults (`user.preferences`), outside React: for route loaders,
 * which decide what to prefetch before the page renders. The defaults without a session.
 */
export function currentPreferences(): Preferences {
  return authStore.getState().user?.preferences ?? DEFAULT_PREFERENCES;
}

/** The same in a component; re-renders when they change. */
export function usePreferences(): Preferences {
  const { user } = useAuth();
  return user?.preferences ?? DEFAULT_PREFERENCES;
}

/**
 * The search value for a pick that has a default: absent when it is the default, so the
 * URL only says what differs from it (a preference fills in what a URL leaves open).
 */
export function unlessDefault<T extends string>(value: T, fallback: T): T | undefined {
  return value === fallback ? undefined : value;
}
