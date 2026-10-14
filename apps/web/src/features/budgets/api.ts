import { type BudgetInput, budgetListResponseSchema } from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const budgetsPath = (householdId: string) => `${householdPath(householdId)}/budgets`;

export const budgetsApi = {
  list: async ({
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
        `${budgetsPath(householdId)}?${new URLSearchParams({ month }).toString()}`,
        budgetListResponseSchema,
        { signal },
      )
    ).budgets,
  set: ({
    householdId,
    categoryId,
    input,
  }: {
    householdId: string;
    categoryId: string;
    input: BudgetInput;
  }) => http.put(`${budgetsPath(householdId)}/${encodeURIComponent(categoryId)}`, noContent, input),
};
