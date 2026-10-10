import { categoryListResponseSchema } from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http } from '@/lib/http';

export const categoriesApi = {
  list: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (
      await http.get(`${householdPath(householdId)}/categories`, categoryListResponseSchema, {
        signal,
      })
    ).categories,
};
