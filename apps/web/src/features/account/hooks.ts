import type { Locale, UpdatePreferencesInput, User } from '@splinance/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { householdQueries } from '@/features/households/queries';
import { authStore } from '@/lib/auth-store';
import { localeStore } from '@/lib/locale';
import { accountApi } from './api';
import { accountQueries } from './queries';

// The inline form renders the error itself.
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.updateProfile,
    onSuccess: async (user) => {
      // The account menu reads the user from the store, member lists from the households.
      authStore.setUser(user);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountQueries.all() }),
        queryClient.invalidateQueries({ queryKey: householdQueries.all() }),
      ]);
    },
    meta: { suppressErrorToast: true },
  });
}

/**
 * Switches the UI language at once (this device remembers it) and, for a signed-in user,
 * saves it to the account so every other device follows. The demo keeps it on the device:
 * account writes are closed there. A failed save shows the usual toast; the next session
 * refresh brings the saved language back.
 */
export function useSaveLocale() {
  return useMutation({
    mutationFn: async (locale: Locale) => {
      await localeStore.setLocale(locale);
      const { user } = authStore.getState();
      if (__DEMO_SITE__ || !user || user.locale === locale) return;
      authStore.setUser(await accountApi.updateProfile({ locale }));
    },
  });
}

/** The newest preferences save: an older answer must not undo a newer pick on screen. */
let latestSave = 0;

/**
 * Saves preferences, shown at once: the user in the store changes before the request (the
 * pages read their defaults from it) and goes back if the save fails, with the usual toast.
 * Only the newest save's answer is applied. Also on the demo, where preferences stay open.
 */
export function useSavePreferences() {
  return useMutation({
    mutationFn: accountApi.updatePreferences,
    onMutate: (input: UpdatePreferencesInput): { previous: User | null; save: number } => {
      const previous = authStore.getState().user;
      if (previous) {
        const { preferences } = previous;
        authStore.setUser({
          ...previous,
          preferences: {
            overviewView: input.overviewView ?? preferences.overviewView,
            transactionVisibility: input.transactionVisibility ?? preferences.transactionVisibility,
            spendingView: input.spendingView ?? preferences.spendingView,
          },
        });
      }
      latestSave += 1;
      return { previous, save: latestSave };
    },
    onSuccess: (user, _input, context) => {
      if (context.save === latestSave) authStore.setUser(user);
    },
    onError: (_error, _input, context) => {
      if (context?.previous && context.save === latestSave) authStore.setUser(context.previous);
    },
  });
}

// The dialog shows wrong-password and rule errors next to the fields.
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountQueries.all() }),
    meta: { suppressErrorToast: true },
  });
}

// Fails rarely; the global toast is enough.
export function useRevokeOtherSessions() {
  return useMutation({ mutationFn: accountApi.revokeOtherSessions });
}

/** Leaves the app for the provider (a full-page navigation, like the sign-in buttons). */
function goToProvider(authorizationUrl: string) {
  window.location.assign(authorizationUrl);
}

// The confirm dialog shows a wrong password next to its field.
export function useStartConnect() {
  return useMutation({
    mutationFn: accountApi.startConnect,
    onSuccess: goToProvider,
    meta: { suppressErrorToast: true },
  });
}

export function useStartReauth() {
  return useMutation({ mutationFn: accountApi.startReauth, onSuccess: goToProvider });
}

// The confirm dialog renders the error.
export function useDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.disconnect,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountQueries.all() }),
    meta: { suppressErrorToast: true },
  });
}

/**
 * After deleting, nothing of the account may stay in memory: the session ends as
 * `deleted` (the guards send the browser to /login, which says so) and the cache is
 * emptied. The dialog renders errors itself.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.deleteAccount,
    onSuccess: () => {
      authStore.clear('deleted');
      queryClient.clear();
    },
    meta: { suppressErrorToast: true },
  });
}
