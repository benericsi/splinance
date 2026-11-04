import type { RecurringPreviewInput } from '@splinance/shared';
import { queryOptions } from '@tanstack/react-query';
import { recurringApi } from './api';

export const recurringQueries = {
  all: () => ['recurring'] as const,
  /** Everything of one household: series changes and any transaction change invalidate it. */
  household: (householdId: string) => [...recurringQueries.all(), householdId] as const,
  /** Series with their payments, suggestions and dismissed suggestions, as the caller sees them. */
  list: (householdId: string) =>
    queryOptions({
      queryKey: [...recurringQueries.household(householdId), 'list'],
      queryFn: ({ signal }) => recurringApi.list({ householdId, signal }),
    }),
  /** Which past payments a pattern would match, while the add or edit form is filled in. */
  preview: (householdId: string, input: RecurringPreviewInput) =>
    queryOptions({
      queryKey: [...recurringQueries.household(householdId), 'preview', input],
      queryFn: ({ signal }) => recurringApi.preview({ householdId, input, signal }),
      staleTime: 30_000,
    }),
};
