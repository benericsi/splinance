import {
  accountResponseSchema,
  type ChangePasswordInput,
  profileResponseSchema,
  revokeSessionsResponseSchema,
  type UpdateProfileInput,
} from '@splinance/shared';
import { http, noContent } from '@/lib/http';

export const accountApi = {
  get: ({ signal }: { signal?: AbortSignal | undefined } = {}) =>
    http.get('/account', accountResponseSchema, { signal }),
  updateProfile: async (input: UpdateProfileInput) =>
    (await http.patch('/account', profileResponseSchema, input)).user,
  changePassword: (input: ChangePasswordInput) => http.post('/account/password', noContent, input),
  /** Returns how many other sessions were signed out. */
  revokeOtherSessions: async () =>
    (await http.post('/account/sessions/revoke-others', revokeSessionsResponseSchema)).revoked,
};
