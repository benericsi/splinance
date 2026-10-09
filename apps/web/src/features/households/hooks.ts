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
