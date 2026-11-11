import { calendarResponseSchema } from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http } from '@/lib/http';

export const calendarApi = {
  get: async ({
    householdId,
    month,
    categoryId,
    signal,
  }: {
    householdId: string;
    month: string;
    /** Only this category's spending and series. */
    categoryId?: string | undefined;
    signal?: AbortSignal;
  }) => {
    const query = new URLSearchParams({ month });
    if (categoryId) query.set('categoryId', categoryId);
    return (
      await http.get(
        `${householdPath(householdId)}/calendar?${query.toString()}`,
        calendarResponseSchema,
        { signal },
      )
    ).calendar;
  },
};
