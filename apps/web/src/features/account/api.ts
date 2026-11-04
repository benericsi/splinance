import {
  accountResponseSchema,
  type ChangePasswordInput,
  profileResponseSchema,
  providerRedirectResponseSchema,
  revokeSessionsResponseSchema,
  type UpdateProfileInput,
} from '@splinance/shared';
import { http, noContent } from '@/lib/http';

const identityPath = (provider: string, action: 'connect' | 'reauth' | 'disconnect') =>
  `/account/identities/${encodeURIComponent(provider)}/${action}`;

export const accountApi = {
  get: ({ signal }: { signal?: AbortSignal | undefined } = {}) =>
    http.get('/account', accountResponseSchema, { signal }),
  updateProfile: async (input: UpdateProfileInput) =>
    (await http.patch('/account', profileResponseSchema, input)).user,
  changePassword: (input: ChangePasswordInput) => http.post('/account/password', noContent, input),
  /** Returns how many other sessions were signed out. */
  revokeOtherSessions: async () =>
    (await http.post('/account/sessions/revoke-others', revokeSessionsResponseSchema)).revoked,
  /** The provider's authorization URL; its flow cookie remembers this session. */
  startConnect: async ({
    provider,
    currentPassword,
  }: {
    provider: string;
    currentPassword?: string | undefined;
  }) =>
    (
      await http.post(identityPath(provider, 'connect'), providerRedirectResponseSchema, {
        currentPassword,
      })
    ).authorizationUrl,
  /** Sign in again with a connected provider, then come back to `redirect`. */
  startReauth: async ({ provider, redirect }: { provider: string; redirect: string }) =>
    (
      await http.post(identityPath(provider, 'reauth'), providerRedirectResponseSchema, {
        redirect,
      })
    ).authorizationUrl,
  disconnect: ({
    provider,
    currentPassword,
  }: {
    provider: string;
    currentPassword?: string | undefined;
  }) => http.post(identityPath(provider, 'disconnect'), noContent, { currentPassword }),
};
