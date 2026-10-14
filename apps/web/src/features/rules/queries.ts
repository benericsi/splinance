import { queryOptions } from '@tanstack/react-query';
import { rulesApi } from './api';

export const ruleQueries = {
  all: () => ['rules'] as const,
  household: (householdId: string) => [...ruleQueries.all(), householdId] as const,
  /** In the order they apply. */
  list: (householdId: string) =>
    queryOptions({
      queryKey: [...ruleQueries.household(householdId), 'list'],
      queryFn: ({ signal }) => rulesApi.list({ householdId, signal }),
    }),
  /** Earlier uncategorized transactions the rule would categorize. */
  matches: (householdId: string, ruleId: string) =>
    queryOptions({
      queryKey: [...ruleQueries.household(householdId), 'matches', ruleId],
      queryFn: ({ signal }) => rulesApi.matches({ householdId, ruleId, signal }),
      staleTime: 0,
    }),
};
