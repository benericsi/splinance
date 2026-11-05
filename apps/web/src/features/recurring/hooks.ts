import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notificationQueries } from '@/features/notifications/queries';
import { i18n } from '@/i18n';
import { recurringApi } from './api';
import { recurringQueries } from './queries';

function useInvalidateRecurring() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: recurringQueries.household(householdId) }),
      // Renewal reminders follow the series.
      queryClient.invalidateQueries({ queryKey: notificationQueries.all() }),
    ]);
}

// The dialog shows the error itself (a taken pattern next to its field).
export function useAddSeries() {
  return useMutation({
    mutationFn: recurringApi.create,
    onSuccess: useInvalidateRecurring(),
    meta: { suppressErrorToast: true },
  });
}

export function useUpdateSeries() {
  return useMutation({
    mutationFn: recurringApi.update,
    onSuccess: useInvalidateRecurring(),
    meta: { suppressErrorToast: true },
  });
}

/** "Stop tracking" a series, or "Show again" for a dismissed suggestion. */
export function useRemoveSeries() {
  return useMutation({ mutationFn: recurringApi.remove, onSuccess: useInvalidateRecurring() });
}

export function useConfirmSuggestion() {
  return useMutation({ mutationFn: recurringApi.confirm, onSuccess: useInvalidateRecurring() });
}

/**
 * "Not recurring", with an undo in the toast: the dismissal is found in the refreshed list by
 * its pattern and scope (the API answers 204 without an id) and deleted again.
 */
export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  const remove = useRemoveSeries();
  return useMutation({
    mutationFn: recurringApi.dismiss,
    onSuccess: async (_data, { householdId, decision }) => {
      await queryClient.invalidateQueries({ queryKey: recurringQueries.household(householdId) });
      toast(i18n.t('recurring:suggestion.hidden'), {
        duration: 8000,
        action: {
          label: i18n.t('common:undo'),
          onClick: () => {
            const list = queryClient.getQueryData(recurringQueries.list(householdId).queryKey);
            const dismissal = list?.dismissed.find(
              (d) => d.pattern === decision.key && d.scope === decision.scope,
            );
            if (dismissal) remove.mutate({ householdId, seriesId: dismissal.id });
          },
        },
      });
    },
  });
}
