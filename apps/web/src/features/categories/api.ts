import {
  categoryListResponseSchema,
  categoryResponseSchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const listPath = (householdId: string) => `${householdPath(householdId)}/categories`;
const itemPath = (householdId: string, categoryId: string) =>
  `${listPath(householdId)}/${encodeURIComponent(categoryId)}`;

interface CategoryRef {
  householdId: string;
  categoryId: string;
}

export const categoriesApi = {
  list: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(listPath(householdId), categoryListResponseSchema, { signal })).categories,
  create: async ({ householdId, input }: { householdId: string; input: CreateCategoryInput }) =>
    (await http.post(listPath(householdId), categoryResponseSchema, input)).category,
  update: async ({
    householdId,
    categoryId,
    input,
  }: CategoryRef & { input: UpdateCategoryInput }) =>
    (await http.patch(itemPath(householdId, categoryId), categoryResponseSchema, input)).category,
  archive: ({ householdId, categoryId }: CategoryRef) =>
    http.delete(itemPath(householdId, categoryId), noContent),
  restore: async ({ householdId, categoryId }: CategoryRef) =>
    (await http.post(`${itemPath(householdId, categoryId)}/restore`, categoryResponseSchema))
      .category,
};
