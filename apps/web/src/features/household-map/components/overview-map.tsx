import type {
  Balances,
  BudgetList,
  Category,
  HouseholdDetail,
  RecurringList,
} from '@splinance/shared';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { lazy, Suspense, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { importQueries } from '@/features/imports/queries';
import { inviteQueries } from '@/features/invites/queries';
import { today } from '@/features/transactions/dates';
import { buildMap } from '../build-map';

const HouseholdMap = lazy(() => import('./household-map'));

/** The map's box while its data or its code loads. */
export function MapSkeleton() {
  return <Skeleton className="h-[min(70vh,40rem)] w-full rounded-xl" />;
}

/**
 * The overview as a map. Takes what the overview already loaded and adds the viewer's
 * imports and, for owners, pending invites (they arrive when they arrive: the invite
 * node is the only thing waiting on them).
 */
export function OverviewMap({
  household,
  viewerId,
  balances,
  budgets,
  categories,
  recurring,
}: {
  household: HouseholdDetail;
  viewerId: string;
  balances: Balances;
  budgets: BudgetList;
  categories: Category[];
  recurring: RecurringList;
}) {
  const { data: imports } = useSuspenseQuery(importQueries.list(household.id));
  const { data: invites } = useQuery({
    ...inviteQueries.list(household.id),
    enabled: household.role === 'owner',
  });

  const map = useMemo(
    () =>
      buildMap({
        household,
        viewerId,
        balances,
        budgets,
        categories,
        recurring,
        imports,
        invites: invites ?? [],
        today: today(),
        now: new Date(),
      }),
    [household, viewerId, balances, budgets, categories, recurring, imports, invites],
  );

  return (
    <Suspense fallback={<MapSkeleton />}>
      <HouseholdMap map={map} />
    </Suspense>
  );
}
