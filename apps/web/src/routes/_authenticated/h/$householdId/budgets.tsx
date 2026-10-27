import { monthSchema } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { MonthNav } from '@/components/month-nav';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SkeletonActions, SkeletonLine, SkeletonStats } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
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
  pendingComponent: BudgetsSkeleton,
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
    <RevealPage>
      <PageTitle title={`Budgets · ${household.name}`} />
      <PageHeader title="Budgets" actions={setLink('Set budget')} />
      <Reveal index={0} className="mb-6">
        <MonthNav month={month} page="/h/$householdId/budgets" />
      </Reveal>

      <Reveal index={1}>
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
      </Reveal>

      {/* The set budget dialog renders over the page. */}
      <Outlet />
    </RevealPage>
  );
}

/** Month switcher, the totals and a few budget rows with their bars. */
function BudgetsSkeleton() {
  return (
    <PageSkeleton>
      <PageHeader title="Budgets" actions={<SkeletonActions widths={['w-32']} />} />
      <div className="mb-6 flex h-8 items-center">
        <SkeletonLine line="h-7" className="w-48" />
      </div>
      <div className="space-y-4">
        <SkeletonStats count={3} />
        <div className="divide-y rounded-xl border">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <SkeletonLine className="w-28" />
                </div>
                <SkeletonLine className="w-32" />
              </div>
              <div className="mt-2 space-y-1">
                <Skeleton className="h-2 rounded-full" />
                <SkeletonLine line="h-4" className="w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
