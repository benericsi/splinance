import {
  type SavingsEntryInput,
  savingsEntryListResponseSchema,
  savingsEntryResponseSchema,
  type SavingsGoalInput,
  savingsRuleListResponseSchema,
  type SavingsRuleInput,
  savingsRuleResponseSchema,
  savingsGoalResponseSchema,
  savingsResponseSchema,
  type UpdateSavingsGoalInput,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const savingsPath = (householdId: string) => `${householdPath(householdId)}/savings`;
const goalPath = ({ householdId, goalId }: GoalRef) =>
  `${savingsPath(householdId)}/${encodeURIComponent(goalId)}`;

export interface GoalRef {
  householdId: string;
  goalId: string;
}

export const savingsApi = {
  /** The goals the viewer can see and what they set aside in `month`. */
  get: async ({
    householdId,
    month,
    signal,
  }: {
    householdId: string;
    month: string;
    signal?: AbortSignal;
  }) =>
    (
      await http.get(
        `${savingsPath(householdId)}?${new URLSearchParams({ month }).toString()}`,
        savingsResponseSchema,
        { signal },
      )
    ).savings,
  createGoal: async ({ householdId, input }: { householdId: string; input: SavingsGoalInput }) =>
    (await http.post(savingsPath(householdId), savingsGoalResponseSchema, input)).goal,
  updateGoal: async ({ input, ...ref }: GoalRef & { input: UpdateSavingsGoalInput }) =>
    (await http.patch(goalPath(ref), savingsGoalResponseSchema, input)).goal,
  archiveGoal: (ref: GoalRef) => http.post(`${goalPath(ref)}/archive`, noContent),
  setPinned: ({ pinned, ...ref }: GoalRef & { pinned: boolean }) =>
    pinned
      ? http.put(`${goalPath(ref)}/pin`, noContent)
      : http.delete(`${goalPath(ref)}/pin`, noContent),
  listEntries: ({
    cursor,
    signal,
    ...ref
  }: GoalRef & { cursor?: string | undefined; signal?: AbortSignal }) => {
    const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : '';
    return http.get(`${goalPath(ref)}/entries${query}`, savingsEntryListResponseSchema, {
      signal,
    });
  },
  addEntry: ({ input, ...ref }: GoalRef & { input: SavingsEntryInput }) =>
    http.post(`${goalPath(ref)}/entries`, savingsEntryResponseSchema, input),
  removeEntry: ({ entryId, ...ref }: GoalRef & { entryId: string }) =>
    http.delete(`${goalPath(ref)}/entries/${encodeURIComponent(entryId)}`, noContent),
  /** The viewer's own savings rules, oldest first (the order they apply in). */
  listRules: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(`${savingsPath(householdId)}/rules`, savingsRuleListResponseSchema, { signal }))
      .rules,
  createRule: async ({ householdId, input }: { householdId: string; input: SavingsRuleInput }) =>
    (await http.post(`${savingsPath(householdId)}/rules`, savingsRuleResponseSchema, input)).rule,
};
