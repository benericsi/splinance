import {
  type ImportCheckInput,
  importCheckResponseSchema,
  type ImportInput,
  importListResponseSchema,
  importResponseSchema,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const importsPath = (householdId: string) => `${householdPath(householdId)}/imports`;

export const importsApi = {
  list: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(importsPath(householdId), importListResponseSchema, { signal })).batches,
  check: async ({ householdId, input }: { householdId: string; input: ImportCheckInput }) =>
    (await http.post(`${importsPath(householdId)}/check`, importCheckResponseSchema, input)).rows,
  create: ({ householdId, input }: { householdId: string; input: ImportInput }) =>
    http.post(importsPath(householdId), importResponseSchema, input),
  undo: ({ householdId, importId }: { householdId: string; importId: string }) =>
    http.delete(`${importsPath(householdId)}/${encodeURIComponent(importId)}`, noContent),
};
