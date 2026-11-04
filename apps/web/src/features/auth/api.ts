import {
  authProvidersResponseSchema,
  authResponseSchema,
  type LoginInput,
  oauthPendingLinkResponseSchema,
  type RegisterInput,
} from '@splinance/shared';
import { http, noContent } from '@/lib/http';

// Credential endpoints are public: a 401 there means wrong credentials, not an expired token.
export const authApi = {
  register: (input: RegisterInput) =>
    http.post('/auth/register', authResponseSchema, input, { auth: false }),
  login: (input: LoginInput) =>
    http.post('/auth/login', authResponseSchema, input, { auth: false }),
  logout: () => http.post('/auth/logout', noContent, undefined, { auth: false }),
  /** Sign-in providers configured on this instance ("Continue with Google"). */
  providers: ({ signal }: { signal?: AbortSignal | undefined } = {}) =>
    http
      .get('/auth/providers', authProvidersResponseSchema, { auth: false, signal })
      .then((body) => body.providers),
  /** The provider account waiting for a password login to connect it (404: none). */
  pendingLink: ({ signal }: { signal?: AbortSignal | undefined } = {}) =>
    http.get('/auth/oauth/link', oauthPendingLinkResponseSchema, { auth: false, signal }),
};
