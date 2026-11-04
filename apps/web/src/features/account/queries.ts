import { queryOptions } from '@tanstack/react-query';
import { accountApi } from './api';

export const accountQueries = {
  all: () => ['account'] as const,
  detail: () =>
    queryOptions({
      queryKey: [...accountQueries.all(), 'detail'],
      queryFn: ({ signal }) => accountApi.get({ signal }),
    }),
  /** Always fresh: balances and memberships change elsewhere. */
  deletion: () =>
    queryOptions({
      queryKey: [...accountQueries.all(), 'deletion'],
      queryFn: ({ signal }) => accountApi.deletionPreview({ signal }),
      staleTime: 0,
    }),
};
