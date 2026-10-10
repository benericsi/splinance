import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { transactionsApi } from './api';

export const transactionQueries = {
  all: () => ['transactions'] as const,
  /** Everything of one household: what a write invalidates. */
  household: (householdId: string) => [...transactionQueries.all(), householdId] as const,
  /** One month, newest first, paged by the API's cursor ("Load more"). */
  list: (householdId: string, month: string) =>
    infiniteQueryOptions({
      queryKey: [...transactionQueries.household(householdId), 'list', month],
      queryFn: ({ pageParam, signal }) =>
        transactionsApi.list({ householdId, month, cursor: pageParam ?? undefined, signal }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  summary: (householdId: string, month: string) =>
    queryOptions({
      queryKey: [...transactionQueries.household(householdId), 'summary', month],
      queryFn: ({ signal }) => transactionsApi.summary({ householdId, month, signal }),
    }),
  detail: (householdId: string, transactionId: string) =>
    queryOptions({
      queryKey: [...transactionQueries.household(householdId), 'detail', transactionId],
      queryFn: ({ signal }) => transactionsApi.get({ householdId, transactionId, signal }),
    }),
};
