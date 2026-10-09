import {
  type CreateHouseholdInput,
  householdDetailResponseSchema,
  householdListResponseSchema,
  householdResponseSchema,
  type HouseholdRole,
  memberResponseSchema,
  type UpdateHouseholdInput,
} from '@splinance/shared';
import { http, noContent } from '@/lib/http';

export const householdPath = (householdId: string) =>
  `/households/${encodeURIComponent(householdId)}`;

const memberPath = (householdId: string, userId: string) =>
  `${householdPath(householdId)}/members/${encodeURIComponent(userId)}`;

export const householdsApi = {
  list: async ({ signal }: { signal?: AbortSignal } = {}) =>
    (await http.get('/households', householdListResponseSchema, { signal })).households,
  get: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(householdPath(householdId), householdDetailResponseSchema, { signal }))
      .household,
  create: async (input: CreateHouseholdInput) =>
    (await http.post('/households', householdResponseSchema, input)).household,
  update: async ({ householdId, input }: { householdId: string; input: UpdateHouseholdInput }) =>
    (await http.patch(householdPath(householdId), householdResponseSchema, input)).household,
  archive: ({ householdId }: { householdId: string }) =>
    http.delete(householdPath(householdId), noContent),
  leave: ({ householdId }: { householdId: string }) =>
    http.post(`${householdPath(householdId)}/leave`, noContent),
  updateMemberRole: async ({
    householdId,
    userId,
    role,
  }: {
    householdId: string;
    userId: string;
    role: HouseholdRole;
  }) => (await http.patch(memberPath(householdId, userId), memberResponseSchema, { role })).member,
  removeMember: ({ householdId, userId }: { householdId: string; userId: string }) =>
    http.delete(memberPath(householdId, userId), noContent),
};
