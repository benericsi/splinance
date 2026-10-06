import { z } from 'zod';

/** Liveness: the process is up. Never depends on external services. */
export const liveResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
});

export type LiveResponse = z.infer<typeof liveResponseSchema>;

const checkStatusSchema = z.enum(['ok', 'error']);

/** Readiness: the process can serve traffic (dependencies reachable). */
export const readyResponseSchema = z.object({
  status: checkStatusSchema,
  checks: z.object({
    database: checkStatusSchema,
  }),
});

export type ReadyResponse = z.infer<typeof readyResponseSchema>;
