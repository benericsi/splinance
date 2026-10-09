import type { AuthResponse } from '@splinance/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authStore } from '@/lib/auth-store';
import { authApi } from './api';

function startSession({ accessToken, user }: AuthResponse) {
  authStore.setSession(accessToken, user);
}

// Forms render these errors next to the fields, so the global toast stays quiet.
export function useLogin() {
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: startSession,
    meta: { suppressErrorToast: true },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: startSession,
    meta: { suppressErrorToast: true },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    // Log out locally even if the request fails: the user asked to leave.
    onSettled: () => {
      authStore.clear('logout');
      // Never keep the previous user's data in memory.
      queryClient.clear();
    },
  });
}
