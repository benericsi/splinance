import { queryOptions } from '@tanstack/react-query';
import { calendarApi } from './api';

export const calendarQueries = {
  all: () => ['calendar'] as const,
  /** Everything of one household: spending, settlements and series changes invalidate it. */
  household: (householdId: string) => [...calendarQueries.all(), householdId] as const,
  /** One month: day totals and the month's events, for everything or one category. */
  month: (householdId: string, month: string, categoryId?: string) =>
    queryOptions({
      queryKey: [...calendarQueries.household(householdId), month, categoryId ?? 'all'],
      queryFn: ({ signal }) => calendarApi.get({ householdId, month, categoryId, signal }),
    }),
};
