import { useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetsApi } from './api';
import { budgetQueries } from './queries';

// The dialog shows the error itself.
export function useSetBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: budgetsApi.set,
    onSuccess: (_data, { householdId }) =>
      queryClient.invalidateQueries({ queryKey: budgetQueries.household(householdId) }),
    meta: { suppressErrorToast: true },
  });
}
