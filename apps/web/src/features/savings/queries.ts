import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { savingsApi } from './api';

export const savingsQueries = {
  all: () => ['savings'] as const,
  /** Everything of one household: any goal, entry or pin change invalidates it. */
  household: (householdId: string) => [...savingsQueries.all(), householdId] as const,
  /** The goals, with what the viewer set aside in `month`. */
  month: (householdId: string, month: string) =>
    queryOptions({
      queryKey: [...savingsQueries.household(householdId), 'goals', month],
      queryFn: ({ signal }) => savingsApi.get({ householdId, month, signal }),
    }),
  /** A goal's history, newest first, paged by the API's cursor. */
  entries: (householdId: string, goalId: string) =>
    infiniteQueryOptions({
      queryKey: [...savingsQueries.household(householdId), 'entries', goalId],
      queryFn: ({ pageParam, signal }) =>
        savingsApi.listEntries({ householdId, goalId, cursor: pageParam ?? undefined, signal }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
};
