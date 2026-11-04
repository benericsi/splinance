import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SkeletonActions, SkeletonLine, SkeletonRow } from '@/components/skeletons';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { HiddenList } from '@/features/recurring/components/hidden-list';
import { RecurringSummary } from '@/features/recurring/components/recurring-summary';
import { SeriesList } from '@/features/recurring/components/series-list';
import { SuggestionList } from '@/features/recurring/components/suggestion-list';
import { recurringQueries } from '@/features/recurring/queries';
import { viewSeries } from '@/features/recurring/view';
import { today } from '@/features/transactions/dates';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';

export const Route = createFileRoute('/_authenticated/h/$householdId/recurring')({
  loader: async ({ context: { queryClient }, params: { householdId } }) => {
    await Promise.all([
      queryClient.query(recurringQueries.list(householdId)),
      queryClient.query(categoryQueries.list(householdId)),
    ]);
  },
  component: RecurringPage,
  pendingComponent: RecurringSkeleton,
});

function RecurringPage() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data } = useSuspenseQuery(recurringQueries.list(householdId));
  const now = today();
  // Soonest first; ones gone quiet go last, where they ask whether they were cancelled.
  const views = data.series
    .map((series) => viewSeries(series, now, household.members.length))
    .sort(
      (a, b) =>
        Number(a.timing === 'lapsed') - Number(b.timing === 'lapsed') ||
        a.nextOn.localeCompare(b.nextOn),
    );
  const empty = views.length === 0 && data.suggestions.length === 0;

  const addLink = (label: string) => (
    <Link
      from="/h/$householdId/recurring"
      to="/h/$householdId/recurring/new"
      state={OPEN_MODAL_STATE}
      className={buttonVariants({ size: 'lg' })}
    >
      <Plus aria-hidden />
      {label}
    </Link>
  );

  return (
    <RevealPage>
      <PageTitle title={`Recurring · ${household.name}`} />
      <PageHeader title="Recurring" actions={addLink('Add')} />

      {empty ? (
        <Reveal index={0}>
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <h2 className="font-heading text-lg font-semibold">Track subscriptions and bills</h2>
            <p className="text-muted-foreground mx-auto mt-1 mb-5 max-w-sm">
              Add the ones you pay regularly, or import your bank exports: payments that come back
              every week, month or year show up here as suggestions.
            </p>
            {addLink('Add a recurring payment')}
          </div>
        </Reveal>
      ) : (
        <div className="space-y-8">
          {views.length > 0 && (
            <Reveal index={0} className="space-y-4">
              <RecurringSummary views={views} currency={data.currency} />
              <SeriesList
                householdId={householdId}
                views={views}
                categories={categories}
                currency={data.currency}
              />
            </Reveal>
          )}

          {data.suggestions.length > 0 && (
            <Reveal index={1}>
              <section aria-labelledby="suggestions-heading" className="space-y-3">
                <div>
                  <h2 id="suggestions-heading" className="font-heading text-lg font-semibold">
                    Suggestions
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    These look recurring. Confirm the ones you pay regularly.
                  </p>
                </div>
                <SuggestionList
                  householdId={householdId}
                  suggestions={data.suggestions}
                  categories={categories}
                  currency={data.currency}
                />
              </section>
            </Reveal>
          )}
        </div>
      )}

      {data.dismissed.length > 0 && (
        <Reveal index={2} className="mt-6">
          <HiddenList householdId={householdId} dismissed={data.dismissed} />
        </Reveal>
      )}

      {/* The add and series dialogs render over the page. */}
      <Outlet />
    </RevealPage>
  );
}

/** The monthly total and a few rows, like the real list. */
function RecurringSkeleton() {
  return (
    <PageSkeleton>
      <PageHeader title="Recurring" actions={<SkeletonActions widths={['w-24']} />} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SkeletonLine className="w-12" />
            <SkeletonLine line="h-8" className="w-48" />
            <SkeletonLine line="h-4" className="w-20" />
          </div>
          <Skeleton className="h-9 w-56 rounded-lg" />
        </div>
        <div className="divide-y rounded-xl border">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonRow key={index} className="px-4 py-3" />
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
