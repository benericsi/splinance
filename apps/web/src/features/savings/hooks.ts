import { useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi } from './api';
import { savingsQueries } from './queries';

/** Goals, balances, pins and histories of the household all come from the same few rows. */
function useInvalidateSavings() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    queryClient.invalidateQueries({ queryKey: savingsQueries.household(householdId) });
}

// The dialogs show their errors themselves.
export function useCreateGoal() {
  return useMutation({
    mutationFn: savingsApi.createGoal,
    onSuccess: useInvalidateSavings(),
    meta: { suppressErrorToast: true },
  });
}

export function useUpdateGoal() {
  return useMutation({
    mutationFn: savingsApi.updateGoal,
    onSuccess: useInvalidateSavings(),
    meta: { suppressErrorToast: true },
  });
}

export function useArchiveGoal() {
  return useMutation({
    mutationFn: savingsApi.archiveGoal,
    onSuccess: useInvalidateSavings(),
    meta: { suppressErrorToast: true },
  });
}

export function useAddEntry() {
  return useMutation({
    mutationFn: savingsApi.addEntry,
    onSuccess: useInvalidateSavings(),
    meta: { suppressErrorToast: true },
  });
}

export function useRemoveEntry() {
  return useMutation({
    mutationFn: savingsApi.removeEntry,
    onSuccess: useInvalidateSavings(),
    meta: { suppressErrorToast: true },
  });
}

/** Errors (the pin limit) go to the global toast. */
export function useSetGoalPinned() {
  return useMutation({
    mutationFn: savingsApi.setPinned,
    onSuccess: useInvalidateSavings(),
  });
}
