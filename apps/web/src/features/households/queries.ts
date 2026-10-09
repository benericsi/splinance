import { queryOptions } from '@tanstack/react-query';
import { householdsApi } from './api';

export const householdQueries = {
  all: () => ['households'] as const,
  list: () =>
    queryOptions({
      queryKey: [...householdQueries.all(), 'list'],
      queryFn: ({ signal }) => householdsApi.list({ signal }),
    }),
  detail: (householdId: string) =>
    queryOptions({
      queryKey: [...householdQueries.all(), 'detail', householdId],
      queryFn: ({ signal }) => householdsApi.get({ householdId, signal }),
    }),
};
