import { queryOptions } from '@tanstack/react-query';
import { demoApi } from './api';

export const demoQueries = {
  all: () => ['demo'] as const,
  // The expiry never changes; refetching it would only cost requests.
  status: () =>
    queryOptions({
      queryKey: [...demoQueries.all(), 'status'],
      queryFn: demoApi.status,
      staleTime: Infinity,
    }),
};
