import { monthSchema } from '@splinance/shared';
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
import { ActivityViewSwitch } from '@/features/calendar/components/activity-view-switch';
import { CalendarGrid, CalendarLegend } from '@/features/calendar/components/calendar-grid';
import { CalendarSummary } from '@/features/calendar/components/calendar-summary';
import { calendarQueries } from '@/features/calendar/queries';
import type { CalendarView } from '@/features/calendar/view';
import { householdQueries } from '@/features/households/queries';
import { currentMonth } from '@/features/transactions/dates';

/**
 * `month`: absent means the current one, like Transactions and Budgets. `view`: the whole
 * household's spending (default) or the viewer's share, like Reports.
 */
const searchSchema = z.object({
  month: monthSchema.optional().catch(undefined),
  view: z.enum(['household', 'mine']).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/h/$householdId/calendar')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { month } }) => {
    await Promise.all([
      queryClient.query(calendarQueries.month(householdId, month)),
      queryClient.query(budgetQueries.month(householdId, month)),
    ]);
  },
  component: CalendarPage,
  pendingComponent: CalendarSkeleton,
});

function CalendarPage() {
  const { t } = useTranslation('calendar');
  const { householdId } = Route.useParams();
  const { month } = Route.useLoaderDeps();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view: CalendarView = search.view ?? 'household';
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: calendar } = useSuspenseQuery(calendarQueries.month(householdId, month));
  const { data: budgets } = useSuspenseQuery(budgetQueries.month(householdId, month));

  return (
    <RevealPage>
      <PageTitle title={t('pageTitle', { household: household.name })} />
      <PageHeader title={t('title')} />
      <ActivityViewSwitch householdId={householdId} active="calendar" month={search.month} />
      <Reveal index={0} className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} page="/h/$householdId/calendar" />
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
      </Reveal>
      <Reveal index={1} className="mb-6">
        <CalendarSummary calendar={calendar} budgets={budgets} view={view} />
      </Reveal>
      <Reveal index={2}>
        <CalendarGrid householdId={householdId} calendar={calendar} view={view} />
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
        <Skeleton className="h-9 w-full rounded-lg sm:w-52" />
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
