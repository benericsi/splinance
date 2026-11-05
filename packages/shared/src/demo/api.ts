import { z } from 'zod';
import { authResponseSchema } from '../auth';
import { localeSchema } from '../i18n/locales';

/** `POST /api/demo` body: the visitor's UI language, which the story is told in. */
export const demoCreateInputSchema = z.object({ locale: localeSchema.optional() });

export type DemoCreateInput = z.infer<typeof demoCreateInputSchema>;

/** `POST /api/demo`: a signed-in visitor and the household to open. */
export const demoCreateResponseSchema = authResponseSchema.extend({
  householdId: z.uuid(),
  /** When the sandbox and everything in it is deleted. */
  expiresAt: z.iso.datetime({ offset: true }),
});

export type DemoCreateResponse = z.infer<typeof demoCreateResponseSchema>;

/** `GET /api/demo`: the visitor's sandbox, for the "deleted in N days" banner. */
export const demoStatusResponseSchema = z.object({
  demo: z.object({ expiresAt: z.iso.datetime({ offset: true }) }),
});

export type DemoStatusResponse = z.infer<typeof demoStatusResponseSchema>;
