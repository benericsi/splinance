import { useMutation, useQueryClient } from '@tanstack/react-query';
import { householdsApi } from './api';
import { householdQueries } from './queries';

// The form renders the error itself, so the global toast stays quiet.
export function useCreateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: householdsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQueries.all() }),
    meta: { suppressErrorToast: true },
  });
}

export function useUpdateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: householdsApi.update,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQueries.all() }),
    meta: { suppressErrorToast: true },
  });
}

// Role changes fail rarely (LAST_OWNER cannot happen from the UI), so the global toast is
// enough.
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: householdsApi.updateMemberRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQueries.all() }),
  });
}

// The confirm dialog shows the error.
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: householdsApi.removeMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQueries.all() }),
    meta: { suppressErrorToast: true },
  });
}

/**
 * After leaving or archiving, the household is a 404 for the caller. Refetching now would
 * hit that 404 while the page is still mounted, so everything is only marked stale; the
 * caller navigates to `/`, whose loader refetches the list (and a later visit refetches
 * the detail, which then shows "not found").
 */
function useExitHousehold(mutationFn: (args: { householdId: string }) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: householdQueries.all(), refetchType: 'none' }),
    meta: { suppressErrorToast: true },
  });
}

export function useLeaveHousehold() {
  return useExitHousehold(householdsApi.leave);
}

export function useArchiveHousehold() {
  return useExitHousehold(householdsApi.archive);
}
