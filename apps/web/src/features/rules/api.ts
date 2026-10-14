import {
  ruleApplyResponseSchema,
  type RuleInput,
  ruleListResponseSchema,
  ruleMatchesResponseSchema,
  ruleResponseSchema,
  type UpdateRuleInput,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const listPath = (householdId: string) => `${householdPath(householdId)}/rules`;
const itemPath = (householdId: string, ruleId: string) =>
  `${listPath(householdId)}/${encodeURIComponent(ruleId)}`;

interface RuleRef {
  householdId: string;
  ruleId: string;
}

export const rulesApi = {
  list: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(listPath(householdId), ruleListResponseSchema, { signal })).rules,
  create: async ({ householdId, input }: { householdId: string; input: RuleInput }) =>
    (await http.post(listPath(householdId), ruleResponseSchema, input)).rule,
  update: async ({ householdId, ruleId, input }: RuleRef & { input: UpdateRuleInput }) =>
    (await http.patch(itemPath(householdId, ruleId), ruleResponseSchema, input)).rule,
  remove: ({ householdId, ruleId }: RuleRef) =>
    http.delete(itemPath(householdId, ruleId), noContent),
  reorder: async ({ householdId, ruleIds }: { householdId: string; ruleIds: string[] }) =>
    (await http.put(`${listPath(householdId)}/order`, ruleListResponseSchema, { ruleIds })).rules,
  matches: async ({ householdId, ruleId, signal }: RuleRef & { signal?: AbortSignal }) =>
    (
      await http.get(`${itemPath(householdId, ruleId)}/matches`, ruleMatchesResponseSchema, {
        signal,
      })
    ).count,
  apply: async ({ householdId, ruleId }: RuleRef) =>
    (await http.post(`${itemPath(householdId, ruleId)}/apply`, ruleApplyResponseSchema)).updated,
};
