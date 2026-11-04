import { queryOptions } from '@tanstack/react-query';
import { accountApi } from './api';

export const accountQueries = {
  all: () => ['account'] as const,
  detail: () =>
    queryOptions({
      queryKey: [...accountQueries.all(), 'detail'],
      queryFn: ({ signal }) => accountApi.get({ signal }),
    }),
};
