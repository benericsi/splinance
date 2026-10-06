import { liveResponseSchema, readyResponseSchema } from '@splinance/shared';
import { http } from '@/lib/http';

// Health checks are public: no token, no refresh on failure.
export const healthApi = {
  live: (signal?: AbortSignal) =>
    http.get('/health/live', liveResponseSchema, { signal, auth: false }),
  ready: (signal?: AbortSignal) =>
    http.get('/health/ready', readyResponseSchema, { signal, auth: false }),
};
