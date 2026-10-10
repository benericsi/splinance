import { useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from './api';
import { categoryQueries } from './queries';

/** Categories show up in pickers and on every transaction row: refresh the household's list. */
function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return (_data: unknown, { householdId }: { householdId: string }) =>
    queryClient.invalidateQueries({ queryKey: categoryQueries.list(householdId).queryKey });
}

// The dialog shows errors itself (a taken name next to the name field).
export function useCreateCategory() {
  return useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: useInvalidateCategories(),
    meta: { suppressErrorToast: true },
  });
}

export function useUpdateCategory() {
  return useMutation({
    mutationFn: categoriesApi.update,
    onSuccess: useInvalidateCategories(),
    meta: { suppressErrorToast: true },
  });
}

// The confirm dialog shows the error.
export function useArchiveCategory() {
  return useMutation({
    mutationFn: categoriesApi.archive,
    onSuccess: useInvalidateCategories(),
    meta: { suppressErrorToast: true },
  });
}

/** A taken name (someone reused it) arrives as the global error toast. */
export function useRestoreCategory() {
  return useMutation({ mutationFn: categoriesApi.restore, onSuccess: useInvalidateCategories() });
}
