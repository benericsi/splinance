import { demoCreateResponseSchema, demoStatusResponseSchema } from '@splinance/shared';
import { http, noContent } from '@/lib/http';
import { localeStore } from '@/lib/locale';

export const demoApi = {
  /**
   * Public: makes a sandbox and signs the visitor in (sets the refresh cookie). The story is
   * told in the language on screen.
   */
  start: () =>
    http.post(
      '/demo',
      demoCreateResponseSchema,
      { locale: localeStore.getState() },
      { auth: false },
    ),
  status: () => http.get('/demo', demoStatusResponseSchema).then((body) => body.demo),
  /** Deletes the visitor's sandbox for good, session included. */
  end: () => http.delete('/demo', noContent),
};
