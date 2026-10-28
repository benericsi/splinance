import { demoCreateResponseSchema, demoStatusResponseSchema } from '@splinance/shared';
import { http, noContent } from '@/lib/http';

export const demoApi = {
  /** Public: makes a sandbox and signs the visitor in (sets the refresh cookie). */
  start: () => http.post('/demo', demoCreateResponseSchema, undefined, { auth: false }),
  status: () => http.get('/demo', demoStatusResponseSchema).then((body) => body.demo),
  /** Deletes the visitor's sandbox for good, session included. */
  end: () => http.delete('/demo', noContent),
};
