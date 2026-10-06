import { liveResponseSchema, readyResponseSchema } from '@splinance/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

const POLL_INTERVAL_MS = 10_000;

// Status checks should report failures immediately, not after retries.
export const healthLiveQuery = queryOptions({
  queryKey: ['health', 'live'],
  queryFn: () => apiFetch('/health/live', liveResponseSchema),
  refetchInterval: POLL_INTERVAL_MS,
  retry: false,
});

export const healthReadyQuery = queryOptions({
  queryKey: ['health', 'ready'],
  queryFn: () => apiFetch('/health/ready', readyResponseSchema),
  refetchInterval: POLL_INTERVAL_MS,
  retry: false,
});
