import {
  createInviteResponseSchema,
  householdResponseSchema,
  inviteListResponseSchema,
  invitePreviewResponseSchema,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const tokenPath = (token: string) => `/invites/${encodeURIComponent(token)}`;

export const invitesApi = {
  create: ({ householdId }: { householdId: string }) =>
    http.post(`${householdPath(householdId)}/invites`, createInviteResponseSchema),
  list: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(`${householdPath(householdId)}/invites`, inviteListResponseSchema, { signal }))
      .invites,
  revoke: ({ householdId, inviteId }: { householdId: string; inviteId: string }) =>
    http.delete(`${householdPath(householdId)}/invites/${encodeURIComponent(inviteId)}`, noContent),
  // Public: the token is the credential, so no access token and no refresh on failure.
  preview: async ({ token, signal }: { token: string; signal?: AbortSignal }) =>
    (await http.get(tokenPath(token), invitePreviewResponseSchema, { signal, auth: false })).invite,
  accept: async ({ token }: { token: string }) =>
    (await http.post(`${tokenPath(token)}/accept`, householdResponseSchema)).household,
};
