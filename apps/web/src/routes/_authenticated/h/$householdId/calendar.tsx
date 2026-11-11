import { addMonths, monthSchema } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { MonthNav } from '@/components/month-nav';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonLine, SkeletonStats } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { budgetQueries } from '@/features/budgets/queries';
import { CategorySummary } from '@/features/calendar/components/category-summary';
import { ActivityViewSwitch } from '@/features/calendar/components/activity-view-switch';
import { CalendarGrid, CalendarLegend } from '@/features/calendar/components/calendar-grid';
import { CalendarSummary } from '@/features/calendar/components/calendar-summary';
import { calendarQueries } from '@/features/calendar/queries';
import type { CalendarView } from '@/features/calendar/view';
import { CategoryPicker } from '@/features/categories/components/category-picker';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { currentMonth } from '@/features/transactions/dates';

/**
 * `month`: absent means the current one, like Transactions and Budgets. `view`: the whole
 * household's spending (default) or the viewer's share, like Reports. `category`: only
 * that category's spending and series (the month before is read too, to compare with).
 */
const searchSchema = z.object({
  month: monthSchema.optional().catch(undefined),
  view: z.enum(['household', 'mine']).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/h/$householdId/calendar')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    month: search.month ?? currentMonth(),
    category: search.category,
  }),
  loader: async ({
    context: { queryClient },
    params: { householdId },
    deps: { month, category },
  }) => {
    await Promise.all([
      queryClient.query(calendarQueries.month(householdId, month, category)),
      queryClient.query(budgetQueries.month(householdId, month)),
      queryClient.query(categoryQueries.list(householdId)),
      ...(category
        ? [queryClient.query(calendarQueries.month(householdId, addMonths(month, -1), category))]
        : []),
    ]);
  },
  component: CalendarPage,
  pendingComponent: CalendarSkeleton,
});

function CalendarPage() {
  const { t } = useTranslation('calendar');
  const { householdId } = Route.useParams();
  const { month, category: categoryId } = Route.useLoaderDeps();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view: CalendarView = search.view ?? 'household';
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: calendar } = useSuspenseQuery(
    calendarQueries.month(householdId, month, categoryId),
  );
  const { data: budgets } = useSuspenseQuery(budgetQueries.month(householdId, month));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  // Spending has categories of the expense kind; an archived one stays while it is picked.
  const pickable = categories.filter(
    (c) => c.kind === 'expense' && (c.archivedAt === null || c.id === categoryId),
  );
  const category = pickable.find((c) => c.id === categoryId);

  return (
    <RevealPage>
      <PageTitle title={t('pageTitle', { household: household.name })} />
      <PageHeader title={t('title')} />
      <ActivityViewSwitch householdId={householdId} active="calendar" month={search.month} />
      <Reveal index={0} className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} page="/h/$householdId/calendar" />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="w-full sm:w-52">
            <CategoryPicker
              id="calendar-category"
              label={t('category.label')}
              noneLabel={t('category.all')}
              compact
              categories={pickable}
              value={category?.id ?? ''}
              onChange={(next) => {
                void navigate({
                  search: (prev) => ({ ...prev, category: next || undefined }),
                  resetScroll: false,
                  replace: true,
                });
              }}
            />
          </div>
          <SegmentedControl
            label={t('whose')}
            className="sm:w-52"
            value={view}
            onChange={(next) => {
              void navigate({
                search: (prev) => ({ ...prev, view: next === 'household' ? undefined : next }),
                resetScroll: false,
                replace: true,
              });
            }}
            options={[
              { value: 'household', label: t('household') },
              { value: 'mine', label: t('yourShare') },
            ]}
          />
        </div>
      </Reveal>
      <Reveal index={1} className="mb-6">
        {category ? (
          <CategorySummary
            householdId={householdId}
            calendar={calendar}
            categoryId={category.id}
            view={view}
          />
        ) : (
          <CalendarSummary calendar={calendar} budgets={budgets} view={view} />
        )}
      </Reveal>
      <Reveal index={2}>
        <CalendarGrid
          householdId={householdId}
          calendar={calendar}
          view={view}
          category={category}
        />
        <CalendarLegend />
      </Reveal>

      {/* A day's dialog renders over the month. */}
      <Outlet />
    </RevealPage>
  );
}

/** The month switcher and the view switch, the three totals and five weeks of days. */
function CalendarSkeleton() {
  const { t } = useTranslation('calendar');
  return (
    <PageSkeleton>
      <PageHeader title={t('title')} />
      <Skeleton className="mb-4 h-9 rounded-lg md:hidden" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex h-8 items-center">
          <SkeletonLine line="h-7" className="w-48" />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Skeleton className="h-8 w-full rounded-lg sm:w-52" />
          <Skeleton className="h-9 w-full rounded-lg sm:w-52" />
        </div>
      </div>
      <div className="mb-6">
        <SkeletonStats count={3} />
      </div>
      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-xl border">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="bg-background flex justify-center py-1.5">
            <SkeletonLine line="h-4" className="w-8" />
          </div>
        ))}
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="bg-background h-14 p-1 sm:h-24 sm:p-1.5">
            <Skeleton className="size-6 rounded-full" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
