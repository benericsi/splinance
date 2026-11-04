import { useMutation, useQueryClient } from '@tanstack/react-query';
import { householdQueries } from '@/features/households/queries';
import { authStore } from '@/lib/auth-store';
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
