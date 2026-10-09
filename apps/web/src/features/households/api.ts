import {
  type CreateHouseholdInput,
  householdDetailResponseSchema,
  householdListResponseSchema,
  householdResponseSchema,
} from '@splinance/shared';
import { http } from '@/lib/http';

const householdPath = (householdId: string) => `/households/${encodeURIComponent(householdId)}`;

export const householdsApi = {
  list: async ({ signal }: { signal?: AbortSignal } = {}) =>
    (await http.get('/households', householdListResponseSchema, { signal })).households,
  get: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(householdPath(householdId), householdDetailResponseSchema, { signal }))
      .household,
  create: async (input: CreateHouseholdInput) =>
    (await http.post('/households', householdResponseSchema, input)).household,
};
