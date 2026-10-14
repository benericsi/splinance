import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { BudgetDialog } from '@/features/budgets/components/budget-dialog';
import { budgetQueries } from '@/features/budgets/queries';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { currentMonth } from '@/features/transactions/dates';
import { useCloseModal } from '@/lib/route-modal';

/** `category`: the budget to change; none to pick one. The month comes from the page. */
const searchSchema = z.object({ category: z.uuid().optional().catch(undefined) });

/** Child route: the set budget dialog renders over the budgets page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/budgets/set')({
  validateSearch: searchSchema,
  component: SetBudgetRoute,
});

function SetBudgetRoute() {
  const { householdId } = Route.useParams();
  const { category, month: searchMonth } = Route.useSearch();
  const month = searchMonth ?? currentMonth();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data } = useSuspenseQuery(budgetQueries.month(householdId, month));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({
        to: '/h/$householdId/budgets',
        params: { householdId },
        search: (prev) => ({ month: prev.month }),
        replace: true,
      });
    }, [navigate, householdId]),
  );

  return (
    <BudgetDialog
      key={category ?? 'new'}
      householdId={householdId}
      currency={household.baseCurrency}
      month={month}
      categories={categories.filter((c) => c.kind === 'expense' && c.archivedAt === null)}
      budgets={data.budgets}
      initialCategoryId={category}
      onClose={close}
    />
  );
}
