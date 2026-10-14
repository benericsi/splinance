import { monthSchema } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { MonthNav } from '@/components/month-nav';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { buttonVariants } from '@/components/ui/button';
import { BudgetList } from '@/features/budgets/components/budget-list';
import { budgetQueries } from '@/features/budgets/queries';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { currentMonth, formatMonth } from '@/features/transactions/dates';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';

/** No month in the URL means the current one, like transactions. */
const searchSchema = z.object({ month: monthSchema.optional().catch(undefined) });

export const Route = createFileRoute('/_authenticated/h/$householdId/budgets')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { month } }) => {
    await Promise.all([
      queryClient.query(budgetQueries.month(householdId, month)),
      queryClient.query(categoryQueries.list(householdId)),
    ]);
  },
  component: BudgetsPage,
});

function BudgetsPage() {
  const { householdId } = Route.useParams();
  const { month } = Route.useLoaderDeps();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data } = useSuspenseQuery(budgetQueries.month(householdId, month));

  const setLink = (label: string) => (
    <Link
      from="/h/$householdId/budgets"
      to="/h/$householdId/budgets/set"
      search={(prev) => ({ ...prev, category: undefined })}
      state={OPEN_MODAL_STATE}
      className={buttonVariants({ size: 'lg' })}
    >
      <Plus aria-hidden />
      {label}
    </Link>
  );

  return (
    <>
      <PageTitle title={`Budgets · ${household.name}`} />
      <PageHeader title="Budgets" actions={setLink('Set budget')} />
      <div className="mb-6">
        <MonthNav month={month} page="/h/$householdId/budgets" />
      </div>

      {data.budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <h2 className="font-heading text-lg font-semibold">
            No budgets for {formatMonth(month)}
          </h2>
          <p className="text-muted-foreground mx-auto mt-1 mb-5 max-w-sm">
            Give a category a monthly limit and see how shared spending compares. It holds every
            month until you change it.
          </p>
          {setLink('Set a budget')}
        </div>
      ) : (
        <BudgetList
          // A new month is a new list: no row-by-row animation when switching.
          key={month}
          householdId={householdId}
          data={data}
          categories={categories}
        />
      )}

      {/* The set budget dialog renders over the page. */}
      <Outlet />
    </>
  );
}
