import { queryOptions } from '@tanstack/react-query';
import { budgetsApi } from './api';

export const budgetQueries = {
  all: () => ['budgets'] as const,
  /** Everything of one household: budget changes and any spending change invalidate it. */
  household: (householdId: string) => [...budgetQueries.all(), householdId] as const,
  /** The budgets in force in a month, with that month's shared spending. */
  month: (householdId: string, month: string) =>
    queryOptions({
      queryKey: [...budgetQueries.household(householdId), month],
      queryFn: ({ signal }) => budgetsApi.list({ householdId, month, signal }),
    }),
};
