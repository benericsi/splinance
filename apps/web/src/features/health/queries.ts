import { queryOptions } from '@tanstack/react-query';
import { healthApi } from './api';

const POLL_INTERVAL_MS = 10_000;

// Status checks should report failures immediately, not after retries.
export const healthQueries = {
  all: () => ['health'] as const,
  live: () =>
    queryOptions({
      queryKey: [...healthQueries.all(), 'live'],
      queryFn: ({ signal }) => healthApi.live(signal),
      refetchInterval: POLL_INTERVAL_MS,
      retry: false,
    }),
  ready: () =>
    queryOptions({
      queryKey: [...healthQueries.all(), 'ready'],
      queryFn: ({ signal }) => healthApi.ready(signal),
      refetchInterval: POLL_INTERVAL_MS,
      retry: false,
    }),
};
