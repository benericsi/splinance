import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonCard, SkeletonLine, SkeletonRow } from '@/components/skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { BalanceOverview } from '@/features/balances/components/balance-overview';
import { SettlementList } from '@/features/balances/components/settlement-list';
import { balanceQueries } from '@/features/balances/queries';
import { BudgetAlertsCard } from '@/features/budgets/components/budget-alerts-card';
import { budgetQueries } from '@/features/budgets/queries';
import { categoryQueries } from '@/features/categories/queries';
import { MapSkeleton, OverviewMap } from '@/features/household-map/components/overview-map';
import { householdQueries } from '@/features/households/queries';
import { importQueries } from '@/features/imports/queries';
import { UpcomingCard } from '@/features/recurring/components/upcoming-card';
import { recurringQueries } from '@/features/recurring/queries';
import { currentMonth } from '@/features/transactions/dates';
import { i18n } from '@/i18n';
import { useAuth } from '@/lib/auth-store';
import { useMediaQuery } from '@/lib/use-media-query';

/** `view=map`: the same overview drawn as a map (wide screens only); absent means cards. */
const searchSchema = z.object({ view: z.enum(['map']).optional().catch(undefined) });

/** The map needs room: below this the overview is always cards and the switch is hidden. */
const MAP_QUERY = '(min-width: 768px)';

/**
 * The household overview: balances first, then recent settlements and the members, or all
 * of it as a map. A pathless layout, so the settle up dialog can be a child route over it
 * (/h/:id/settle).
 */
export const Route = createFileRoute('/_authenticated/h/$householdId/_overview')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ map: search.view === 'map' }),
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { map } }) => {
    await Promise.all([
      ...(map ? [queryClient.query(importQueries.list(householdId))] : []),
      queryClient.query(balanceQueries.debts(householdId)),
      queryClient.infiniteQuery(balanceQueries.settlements(householdId)),
      queryClient.query(budgetQueries.month(householdId, currentMonth())),
      queryClient.query(categoryQueries.list(householdId)),
      queryClient.query(recurringQueries.list(householdId)),
    ]);
  },
  component: OverviewPage,
  pendingComponent: OverviewSkeleton,
});

function greeting(hour: number, name: string): string {
  if (hour >= 5 && hour < 12) return i18n.t('balances:overview.morning', { name });
  if (hour >= 12 && hour < 18) return i18n.t('balances:overview.afternoon', { name });
  return i18n.t('balances:overview.evening', { name });
}

function OverviewPage() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: balances } = useSuspenseQuery(balanceQueries.debts(householdId));
  const { data: budgets } = useSuspenseQuery(budgetQueries.month(householdId, currentMonth()));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: recurring } = useSuspenseQuery(recurringQueries.list(householdId));
  const { user } = useAuth();
  const { t } = useTranslation('balances');
  const { t: tMap } = useTranslation('map');
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const wide = useMediaQuery(MAP_QUERY);
  const viewerId = user?.id ?? '';
  const showMap = view === 'map' && wide;

  return (
    <RevealPage>
      <PageTitle title={household.name} />
      <PageHeader
        title={greeting(new Date().getHours(), user?.displayName ?? '')}
        actions={
          <SegmentedControl
            label={tMap('view.label')}
            value={view ?? 'cards'}
            onChange={(next) => {
              void navigate({
                search: (previous) => ({ ...previous, view: next === 'map' ? 'map' : undefined }),
                replace: true,
              });
            }}
            options={[
              { value: 'cards', label: tMap('view.cards') },
              { value: 'map', label: tMap('view.map') },
            ]}
            className="hidden w-auto md:flex"
          />
        }
      />
      {showMap ? (
        <Reveal index={0}>
          <OverviewMap
            household={household}
            viewerId={viewerId}
            balances={balances}
            budgets={budgets}
            categories={categories}
            recurring={recurring}
          />
        </Reveal>
      ) : (
        <div className="space-y-6">
          <Reveal index={0}>
            <BalanceOverview household={household} balances={balances} viewerId={viewerId} />
          </Reveal>
          <Reveal index={1}>
            <BudgetAlertsCard householdId={householdId} data={budgets} categories={categories} />
          </Reveal>
          <Reveal index={2}>
            <UpcomingCard
              householdId={householdId}
              data={recurring}
              memberCount={household.members.length}
            />
          </Reveal>
          <Reveal index={3}>
            <SettlementList household={household} viewerId={viewerId} />
          </Reveal>
          <Reveal index={4}>
            <Card>
              <CardHeader>
                <CardTitle>{t('overview.members')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-4">
                  {household.members.map((member) => (
                    <li key={member.userId} className="flex items-center gap-2">
                      <UserAvatar
                        user={{ id: member.userId, displayName: member.displayName }}
                        size={28}
                      />
                      <span className="text-sm">{member.displayName}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      )}

      {/* The settle up dialog renders over the overview. */}
      <Outlet />
    </RevealPage>
  );
}

/** Balance card, settlements and members; the budget card only shows once it is known. */
function OverviewSkeleton() {
  const { user } = useAuth();
  // Re-renders on a language switch.
  useTranslation('balances');
  const { view } = Route.useSearch();
  const wide = useMediaQuery(MAP_QUERY);
  if (view === 'map' && wide) {
    return (
      <PageSkeleton>
        <PageHeader title={greeting(new Date().getHours(), user?.displayName ?? '')} />
        <MapSkeleton />
      </PageSkeleton>
    );
  }
  return (
    <PageSkeleton>
      <PageHeader title={greeting(new Date().getHours(), user?.displayName ?? '')} />
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <SkeletonLine line="h-6" className="w-40" />
            </div>
            <SkeletonLine line="h-10" className="w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </CardContent>
        </Card>
        <SkeletonCard title="w-40">
          <SkeletonRow className="py-2" />
          <SkeletonRow className="py-2" />
        </SkeletonCard>
        <SkeletonCard title="w-24">
          <div className="flex gap-4">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        </SkeletonCard>
      </div>
    </PageSkeleton>
  );
}
