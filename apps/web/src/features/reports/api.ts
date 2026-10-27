import { reportResponseSchema } from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http } from '@/lib/http';

export const reportsApi = {
  get: async ({
    householdId,
    from,
    to,
    signal,
  }: {
    householdId: string;
    from: string;
    to: string;
    signal?: AbortSignal;
  }) =>
    (
      await http.get(
        `${householdPath(householdId)}/reports?${new URLSearchParams({ from, to }).toString()}`,
        reportResponseSchema,
        { signal },
      )
    ).report,
};
