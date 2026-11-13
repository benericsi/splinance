import { type OverviewView, overviewViewSchema } from '@splinance/shared';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SegmentedControl } from '@/components/segmented-control';
import { OverviewRow, Tile, TileBox } from '@/components/tile';
import { SkeletonLine } from '@/components/skeletons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { BalanceOverview } from '@/features/balances/components/balance-overview';
import { SettlementList } from '@/features/balances/components/settlement-list';
import { balanceQueries } from '@/features/balances/queries';
import { BudgetGaugesTile } from '@/features/budgets/components/budget-gauges-tile';
import { currentPreferences, unlessDefault, usePreferences } from '@/features/account/preferences';
import { budgetQueries } from '@/features/budgets/queries';
import { LeftThisMonthCard } from '@/features/calendar/components/left-this-month-card';
import { calendarQueries } from '@/features/calendar/queries';
import { categoryQueries } from '@/features/categories/queries';
import { MapAddMenu } from '@/features/household-map/components/map-add-menu';
import { MapSkeleton, OverviewMap } from '@/features/household-map/components/overview-map';
import { householdQueries } from '@/features/households/queries';
import { importQueries } from '@/features/imports/queries';
import { ComingUpTile, ToReviewTile } from '@/features/recurring/components/coming-up-tile';
import { recurringQueries } from '@/features/recurring/queries';
import { SavingsTile } from '@/features/savings/components/savings-tile';
import { savingsQueries } from '@/features/savings/queries';
import { currentMonth } from '@/features/transactions/dates';
import { i18n } from '@/i18n';
import { useAuth } from '@/lib/auth-store';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * `view`: cards or the same overview drawn as a map (wide screens only); absent means the
 * person's default (`overviewView`).
 */
const searchSchema = z.object({ view: overviewViewSchema.optional().catch(undefined) });

/** The map needs room: below this the overview is always cards and the switch is hidden. */
const MAP_QUERY = '(min-width: 768px)';

/** Whether the map shows: asked for (or the default) and room for it. */
const mapShows = (view: OverviewView, wide: boolean) => view === 'map' && wide;

/**
 * The household overview: a bento grid with what is left of the month on top, then the
 * balance and what is coming up, budgets and savings, settlements and the members; or all
 * of it as a map. A pathless layout, so the settle up dialog can be a child route over it
 * (/h/:id/settle).
 */
export const Route = createFileRoute('/_authenticated/h/$householdId/_overview')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    map: mapShows(
      search.view ?? currentPreferences().overviewView,
      window.matchMedia(MAP_QUERY).matches,
    ),
  }),
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { map } }) => {
    await Promise.all([
      ...(map ? [queryClient.query(importQueries.list(householdId))] : []),
      queryClient.query(balanceQueries.debts(householdId)),
      queryClient.infiniteQuery(balanceQueries.settlements(householdId)),
      queryClient.query(budgetQueries.month(householdId, currentMonth())),
      // The cards only: the map shows nothing of the month's money or of savings.
      ...(map
        ? []
        : [
            queryClient.query(calendarQueries.month(householdId, currentMonth())),
            queryClient.query(savingsQueries.month(householdId, currentMonth())),
          ]),
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
  const search = Route.useSearch();
  const { overviewView } = usePreferences();
  const view = search.view ?? overviewView;
  const navigate = Route.useNavigate();
  const wide = useMediaQuery(MAP_QUERY);
  const viewerId = user?.id ?? '';
  const showMap = mapShows(view, wide);

  return (
    <RevealPage>
      <PageTitle title={household.name} />
      <PageHeader
        title={greeting(new Date().getHours(), user?.displayName ?? '')}
        actions={
          <>
            {showMap && <MapAddMenu household={household} />}
            <SegmentedControl
              label={tMap('view.label')}
              value={view}
              onChange={(next) => {
                void navigate({
                  search: (previous) => ({ ...previous, view: unlessDefault(next, overviewView) }),
                  replace: true,
                });
              }}
              options={[
                { value: 'cards', label: tMap('view.cards') },
                { value: 'map', label: tMap('view.map') },
              ]}
              className="hidden w-auto md:flex"
            />
          </>
        }
      />
      {showMap ? (
        // Not inside `Reveal`: its transform would become what the map fills.
        <OverviewMap
          household={household}
          viewerId={viewerId}
          balances={balances}
          budgets={budgets}
          categories={categories}
          recurring={recurring}
        />
      ) : (
        // The bento grid: rows of tiles weighted out of four columns (`components/tile.tsx`).
        <div className="flex flex-col gap-4">
          <Reveal index={0}>
            <LeftThisMonth
              householdId={householdId}
              tracksIncome={recurring.series.some((series) => series.kind === 'income')}
            />
          </Reveal>
          <OverviewRow>
            <Tile weight={2} index={1}>
              <BalanceOverview household={household} balances={balances} viewerId={viewerId} />
            </Tile>
            <Tile weight={1} index={2}>
              <ComingUpTile
                householdId={householdId}
                data={recurring}
                memberCount={household.members.length}
              />
            </Tile>
            <Tile weight={1} index={3}>
              <ToReviewTile householdId={householdId} data={recurring} />
            </Tile>
          </OverviewRow>
          <OverviewRow>
            <Tile weight={2} index={4}>
              <BudgetGaugesTile householdId={householdId} data={budgets} categories={categories} />
            </Tile>
            <Tile weight={2} index={5}>
              <SavingsGoals householdId={householdId} />
            </Tile>
          </OverviewRow>
          <OverviewRow>
            <Tile weight={3} index={6}>
              <SettlementList household={household} viewerId={viewerId} />
            </Tile>
            <Tile weight={1} index={7} stretch={false}>
              <TileBox title={t('overview.members')}>
                <ul className="flex flex-wrap gap-x-4 gap-y-3">
                  {household.members.map((member) => (
                    <li key={member.userId} className="flex min-w-0 items-center gap-2">
                      <UserAvatar
                        user={{ id: member.userId, displayName: member.displayName }}
                        size={28}
                      />
                      <span className="truncate text-sm">{member.displayName}</span>
                    </li>
                  ))}
                </ul>
              </TileBox>
            </Tile>
          </OverviewRow>
        </div>
      )}

      {/* The settle up dialog renders over the overview. */}
      <Outlet />
    </RevealPage>
  );
}

/**
 * Reads the month itself, so the map (which never shows it) does not wait for it: a narrow
 * screen asked for the map gets the cards and loads it here. What was set aside in savings
 * comes from its own query; until it is known the card counts none.
 */
function LeftThisMonth({
  householdId,
  tracksIncome,
}: {
  householdId: string;
  tracksIncome: boolean;
}) {
  const { data: calendar } = useQuery(calendarQueries.month(householdId, currentMonth()));
  const { data: savings } = useQuery(savingsQueries.month(householdId, currentMonth()));
  return calendar ? (
    <LeftThisMonthCard
      householdId={householdId}
      calendar={calendar}
      setAside={savings?.setAside ?? 0}
      tracksIncome={tracksIncome}
    />
  ) : null;
}

/** The savings tile, reading its goals itself for the same reason. */
function SavingsGoals({ householdId }: { householdId: string }) {
  const { data: savings } = useQuery(savingsQueries.month(householdId, currentMonth()));
  return savings ? <SavingsTile householdId={householdId} savings={savings} /> : null;
}

/** A tile's box while loading: its small title and whatever stands for its content. */
function SkeletonTile({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <SkeletonLine className="w-20" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * The grid's known boxes: the hero, the balance and the members. Tiles that hide when empty
 * (coming up, budgets, savings, settlements) only show once they are known.
 */
function OverviewSkeleton() {
  const { user } = useAuth();
  // Re-renders on a language switch.
  useTranslation('balances');
  const search = Route.useSearch();
  const { overviewView } = usePreferences();
  const wide = useMediaQuery(MAP_QUERY);
  if (mapShows(search.view ?? overviewView, wide)) {
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
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent>
            <SkeletonLine className="w-32" />
            <div className="mt-1 grid gap-x-10 gap-y-4 md:grid-cols-2 md:items-end">
              <div>
                <SkeletonLine line="h-10 md:h-12" className="w-48" />
                <SkeletonLine className="mt-1 w-64 max-w-full" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-7 w-28 rounded-full" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-14 w-full rounded-md" />
            </div>
            <div className="mt-4 border-t pt-3">
              <SkeletonLine className="w-44" />
            </div>
          </CardContent>
        </Card>
        <OverviewRow>
          <Tile weight={2} index={0}>
            <SkeletonTile>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <SkeletonLine className="w-32" />
                </div>
                <SkeletonLine line="h-10" className="w-44" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24 rounded-lg" />
                  <Skeleton className="h-9 w-36 rounded-lg" />
                </div>
              </div>
            </SkeletonTile>
          </Tile>
        </OverviewRow>
        <OverviewRow>
          <Tile weight={1} index={1}>
            <SkeletonTile>
              <div className="flex items-center gap-2">
                <Skeleton className="size-7 rounded-full" />
                <SkeletonLine className="w-24" />
              </div>
            </SkeletonTile>
          </Tile>
        </OverviewRow>
      </div>
    </PageSkeleton>
  );
}
