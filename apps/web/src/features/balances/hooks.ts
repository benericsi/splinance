import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarQueries } from '@/features/calendar/queries';
import { balancesApi } from './api';
import { balanceQueries } from './queries';

/** A settlement changes the debts and the settlement list of its household, and its calendar. */
function useInvalidateBalances() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: balanceQueries.household(householdId) }),
      queryClient.invalidateQueries({ queryKey: calendarQueries.household(householdId) }),
    ]);
}

// The dialog shows the error itself.
export function useCreateSettlement() {
  return useMutation({
    mutationFn: balancesApi.createSettlement,
    onSuccess: useInvalidateBalances(),
    meta: { suppressErrorToast: true },
  });
}

/** Errors go to the global toast; success offers an undo (useRestoreSettlement). */
export function useDeleteSettlement() {
  return useMutation({
    mutationFn: balancesApi.removeSettlement,
    onSuccess: useInvalidateBalances(),
  });
}

export function useRestoreSettlement() {
  return useMutation({
    mutationFn: balancesApi.restoreSettlement,
    onSuccess: useInvalidateBalances(),
  });
}
