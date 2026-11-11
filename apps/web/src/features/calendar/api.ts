import { calendarResponseSchema } from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http } from '@/lib/http';

export const calendarApi = {
  get: async ({
    householdId,
    month,
    signal,
  }: {
    householdId: string;
    month: string;
    signal?: AbortSignal;
  }) =>
    (
      await http.get(
        `${householdPath(householdId)}/calendar?${new URLSearchParams({ month }).toString()}`,
        calendarResponseSchema,
        { signal },
      )
    ).calendar,
};
