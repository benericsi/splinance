import { queryOptions } from '@tanstack/react-query';
import { importsApi } from './api';

export const importQueries = {
  all: () => ['imports'] as const,
  household: (householdId: string) => [...importQueries.all(), householdId] as const,
  /** The viewer's own imports, newest first. */
  list: (householdId: string) =>
    queryOptions({
      queryKey: [...importQueries.household(householdId), 'list'],
      queryFn: ({ signal }) => importsApi.list({ householdId, signal }),
    }),
};
