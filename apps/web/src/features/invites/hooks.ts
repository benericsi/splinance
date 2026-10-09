import { useMutation, useQueryClient } from '@tanstack/react-query';
import { householdQueries } from '@/features/households/queries';
import { invitesApi } from './api';
import { inviteQueries } from './queries';

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invitesApi.create,
    onSuccess: (_data, { householdId }) =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.list(householdId).queryKey }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invitesApi.revoke,
    onSuccess: (_data, { householdId }) =>
      queryClient.invalidateQueries({ queryKey: inviteQueries.list(householdId).queryKey }),
  });
}

// The invite page explains every failure (expired, used, already a member) itself.
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invitesApi.accept,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQueries.all() }),
    meta: { suppressErrorToast: true },
  });
}
