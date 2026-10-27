import { queryOptions } from '@tanstack/react-query';
import { reportsApi } from './api';

export const reportQueries = {
  all: () => ['reports'] as const,
  /** Everything of one household: any spending change invalidates it. */
  household: (householdId: string) => [...reportQueries.all(), householdId] as const,
  /** Month totals and spending per category from `from` to `to`. */
  range: (householdId: string, from: string, to: string) =>
    queryOptions({
      queryKey: [...reportQueries.household(householdId), from, to],
      queryFn: ({ signal }) => reportsApi.get({ householdId, from, to, signal }),
    }),
};
