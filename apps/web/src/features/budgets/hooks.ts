import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationQueries } from '@/features/notifications/queries';
import { budgetsApi } from './api';
import { budgetQueries } from './queries';

// The dialog shows the error itself.
export function useSetBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: budgetsApi.set,
    onSuccess: (_data, { householdId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: budgetQueries.household(householdId) }),
        // Budget alerts follow the limit.
        queryClient.invalidateQueries({ queryKey: notificationQueries.all() }),
      ]),
    meta: { suppressErrorToast: true },
  });
}
