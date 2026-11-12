import type { Currency } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from '@/components/collapse';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SkeletonActions, SkeletonLine, SkeletonStats } from '@/components/skeletons';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { householdQueries } from '@/features/households/queries';
import { GoalBox } from '@/features/savings/components/goal-box';
import { GoalTile } from '@/features/savings/components/goal-tile';
import { SavingsViewSwitch } from '@/features/savings/components/savings-view-switch';
import { savingsQueries } from '@/features/savings/queries';
import { arrangeGoals, memberFills, savingsTotals } from '@/features/savings/view';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { currentMonth } from '@/features/transactions/dates';
import { useAuth } from '@/lib/auth-store';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated/h/$householdId/savings')({
  loader: async ({ context: { queryClient }, params: { householdId } }) => {
    await queryClient.query(savingsQueries.month(householdId, currentMonth()));
  },
  component: SavingsPage,
  pendingComponent: SavingsSkeleton,
});

function SavingsPage() {
  const { t } = useTranslation('savings');
  const { householdId } = Route.useParams();
  const viewerId = useAuth().user?.id ?? '';
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data } = useSuspenseQuery(savingsQueries.month(householdId, currentMonth()));
  const [showClosed, setShowClosed] = useState(false);
  const closedId = useId();

  const { featured, rest, closed, auto } = arrangeGoals(data.goals);
  const fills = memberFills(data.goals, viewerId);
  const totals = savingsTotals(data.goals, viewerId);
  const setAside = data.setAside ?? 0;

  const newLink = (label: string) => (
    <Link
      to="/h/$householdId/savings/new"
      params={{ householdId }}
      state={OPEN_MODAL_STATE}
      className={buttonVariants({ size: 'lg' })}
    >
      <Plus aria-hidden />
      {label}
    </Link>
  );

  return (
    <RevealPage>
      <PageTitle title={t('pageTitle', { household: household.name })} />
      <PageHeader title={t('title')} actions={newLink(t('newGoal'))} />
      <SavingsViewSwitch householdId={householdId} active="savings" />

      {data.goals.length === 0 ? (
        <Reveal index={0}>
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <h2 className="font-heading text-lg font-semibold">{t('empty.title')}</h2>
            <p className="text-muted-foreground mx-auto mt-1 mb-5 max-w-sm">
              {t('empty.description')}
            </p>
            {newLink(t('firstGoal'))}
          </div>
        </Reveal>
      ) : (
        <div className="space-y-4">
          <Reveal index={0}>
            <dl className="grid gap-2 max-sm:grid-cols-[repeat(3,auto)] sm:grid-cols-3 sm:gap-3">
              <Total label={t('totals.saved')} minor={totals.saved} currency={data.currency} />
              <Total label={t('totals.yours')} minor={totals.yours} currency={data.currency} />
              <Total
                label={setAside < 0 ? t('totals.takenOut') : t('totals.setAside')}
                minor={Math.abs(setAside)}
                currency={data.currency}
              />
            </dl>
          </Reveal>

          {featured.length > 0 && (
            <Reveal index={1} className="space-y-4">
              {featured.map((goal) => (
                <GoalBox
                  key={goal.id}
                  householdId={householdId}
                  goal={goal}
                  fills={fills}
                  viewerId={viewerId}
                />
              ))}
              {auto && <p className="text-muted-foreground text-xs">{t('suggested')}</p>}
            </Reveal>
          )}

          {rest.length > 0 && (
            <Reveal index={2}>
              <section>
                {featured.length > 0 && (
                  <h2 className="text-muted-foreground mb-2 text-sm font-medium">{t('others')}</h2>
                )}
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((goal) => (
                    <li key={goal.id}>
                      <GoalTile householdId={householdId} goal={goal} fills={fills} />
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          )}

          {closed.length > 0 && (
            <Reveal index={3}>
              <section>
                <button
                  type="button"
                  aria-expanded={showClosed}
                  aria-controls={closedId}
                  onClick={() => {
                    setShowClosed((value) => !value);
                  }}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center gap-1 rounded-sm text-sm outline-none focus-visible:ring-2"
                >
                  <ChevronRight
                    className={cn('size-4 transition-transform', showClosed && 'rotate-90')}
                    aria-hidden
                  />
                  {t('closed', { count: closed.length })}
                </button>
                <div id={closedId}>
                  <Collapse open={showClosed}>
                    <ul className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                      {closed.map((goal) => (
                        <li key={goal.id}>
                          <GoalTile householdId={householdId} goal={goal} fills={fills} />
                        </li>
                      ))}
                    </ul>
                  </Collapse>
                </div>
              </section>
            </Reveal>
          )}
        </div>
      )}

      {/* The new goal and goal dialogs render over the page. */}
      <Outlet />
    </RevealPage>
  );
}

function Total({ label, minor, currency }: { label: string; minor: number; currency: Currency }) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-lg px-2 py-2.5 sm:px-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-[13px]/5 font-semibold tabular-nums sm:text-lg">
        <MoneyFlow minor={minor} currency={currency} />
      </dd>
    </div>
  );
}

/** The totals, one large goal with its bar and a row of tiles. */
function SavingsSkeleton() {
  const { t } = useTranslation('savings');
  return (
    <PageSkeleton>
      <PageHeader title={t('title')} actions={<SkeletonActions widths={['w-28']} />} />
      <div className="space-y-4">
        <SkeletonStats count={3} />
        <div className="space-y-3 rounded-xl border p-6">
          <SkeletonLine line="h-4" className="w-32" />
          <SkeletonLine line="h-6" className="w-44" />
          <SkeletonLine line="h-9" className="w-56" />
          <Skeleton className="h-2.5 rounded-full" />
          <SkeletonLine line="h-4" className="w-40" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-2 rounded-xl border p-4">
              <SkeletonLine className="w-28" />
              <SkeletonLine line="h-6" className="w-32" />
              <Skeleton className="h-1.5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
