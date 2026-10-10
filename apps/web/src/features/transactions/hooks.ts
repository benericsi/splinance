import { useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi } from './api';
import { transactionQueries } from './queries';

/** Any write can move a transaction between months, days and totals: refresh the household. */
function useInvalidateHousehold() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    queryClient.invalidateQueries({ queryKey: transactionQueries.household(householdId) });
}

// The form shows errors next to the fields (and the version conflict), not as a toast.
export function useCreateTransaction() {
  return useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: useInvalidateHousehold(),
    meta: { suppressErrorToast: true },
  });
}

export function useUpdateTransaction() {
  return useMutation({
    mutationFn: transactionsApi.update,
    onSuccess: useInvalidateHousehold(),
    meta: { suppressErrorToast: true },
  });
}

/**
 * Errors go to the global toast; success offers an undo (see useRestoreTransaction). The
 * deleted transaction's detail is a 404 now and its edit dialog is still mounted, so it is
 * only marked stale; refetching it would throw into the error boundary (like leaving a
 * household, architecture.md hard part 18).
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: transactionsApi.remove,
    onSuccess: async (_data, { householdId, transactionId }) => {
      const detailKey = transactionQueries.detail(householdId, transactionId).queryKey;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey, refetchType: 'none' }),
        queryClient.invalidateQueries({
          queryKey: transactionQueries.household(householdId),
          predicate: (query) => query.queryKey[2] !== 'detail',
        }),
      ]);
    },
  });
}

export function useRestoreTransaction() {
  return useMutation({ mutationFn: transactionsApi.restore, onSuccess: useInvalidateHousehold() });
}
