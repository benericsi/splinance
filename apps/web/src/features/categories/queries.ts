import { queryOptions } from '@tanstack/react-query';
import { categoriesApi } from './api';

export const categoryQueries = {
  all: () => ['categories'] as const,
  /** Archived categories included: old transactions still show theirs. */
  list: (householdId: string) =>
    queryOptions({
      queryKey: [...categoryQueries.all(), 'list', householdId],
      queryFn: ({ signal }) => categoriesApi.list({ householdId, signal }),
      // Categories change rarely; every transaction row reads them.
      staleTime: 5 * 60_000,
    }),
};
