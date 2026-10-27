import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { balanceQueries } from '@/features/balances/queries';
import { budgetQueries } from '@/features/budgets/queries';
import { reportQueries } from '@/features/reports/queries';
import { transactionQueries } from '@/features/transactions/queries';
import { rulesApi } from './api';
import { ruleQueries } from './queries';

function useInvalidateRules() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    queryClient.invalidateQueries({ queryKey: ruleQueries.household(householdId) });
}

// The dialog shows errors itself (a taken text next to the field).
export function useCreateRule() {
  return useMutation({
    mutationFn: rulesApi.create,
    onSuccess: useInvalidateRules(),
    meta: { suppressErrorToast: true },
  });
}

export function useUpdateRule() {
  return useMutation({
    mutationFn: rulesApi.update,
    onSuccess: useInvalidateRules(),
    meta: { suppressErrorToast: true },
  });
}

// The confirm dialog shows the error.
export function useDeleteRule() {
  return useMutation({
    mutationFn: rulesApi.remove,
    onSuccess: useInvalidateRules(),
    meta: { suppressErrorToast: true },
  });
}

export function useReorderRules() {
  return useMutation({ mutationFn: rulesApi.reorder, onSuccess: useInvalidateRules() });
}

/**
 * Categorizes earlier transactions: the lists (and anything showing categories) refresh.
 * The result toast lives here because the button that started it may be gone by then (the
 * toast action of a closed dialog).
 */
export function useApplyRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rulesApi.apply,
    onSuccess: (updated, { householdId }) => {
      toast.success(
        `${String(updated)} ${updated === 1 ? 'transaction' : 'transactions'} categorized`,
      );
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ruleQueries.household(householdId) }),
        queryClient.invalidateQueries({ queryKey: transactionQueries.household(householdId) }),
        queryClient.invalidateQueries({ queryKey: balanceQueries.household(householdId) }),
        queryClient.invalidateQueries({ queryKey: budgetQueries.household(householdId) }),
        queryClient.invalidateQueries({ queryKey: reportQueries.household(householdId) }),
        queryClient.invalidateQueries({ queryKey: reportQueries.household(householdId) }),
      ]);
    },
  });
}
