import { useMutation, useQueryClient } from '@tanstack/react-query';
import { balanceQueries } from '@/features/balances/queries';
import { budgetQueries } from '@/features/budgets/queries';
import { transactionQueries } from '@/features/transactions/queries';
import { importsApi } from './api';
import { importQueries } from './queries';

/** An import or its undo changes transactions, balances and the import history. */
function useInvalidateAfterImport() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionQueries.household(householdId) }),
      queryClient.invalidateQueries({ queryKey: balanceQueries.household(householdId) }),
      queryClient.invalidateQueries({ queryKey: budgetQueries.household(householdId) }),
      queryClient.invalidateQueries({ queryKey: importQueries.household(householdId) }),
    ]);
}

/** A read with a body (up to a thousand rows); the page shows its error. */
export function useCheckImport() {
  return useMutation({ mutationFn: importsApi.check, meta: { suppressErrorToast: true } });
}

// The page shows the error next to the Import button.
export function useCreateImport() {
  return useMutation({
    mutationFn: importsApi.create,
    onSuccess: useInvalidateAfterImport(),
    meta: { suppressErrorToast: true },
  });
}

export function useUndoImport() {
  return useMutation({ mutationFn: importsApi.undo, onSuccess: useInvalidateAfterImport() });
}
