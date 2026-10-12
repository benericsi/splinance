import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { BalanceOverview } from '@/features/balances/components/balance-overview';
import { SettlementList } from '@/features/balances/components/settlement-list';
import { balanceQueries } from '@/features/balances/queries';
import { householdQueries } from '@/features/households/queries';
import { useAuth } from '@/lib/auth-store';

/**
 * The household overview: balances first, then recent settlements and the members. A
 * pathless layout, so the settle up dialog can be a child route over it (/h/:id/settle).
 */
export const Route = createFileRoute('/_authenticated/h/$householdId/_overview')({
  loader: async ({ context: { queryClient }, params: { householdId } }) => {
    await Promise.all([
      queryClient.query(balanceQueries.debts(householdId)),
      queryClient.infiniteQuery(balanceQueries.settlements(householdId)),
    ]);
  },
  component: OverviewPage,
});

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function OverviewPage() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: balances } = useSuspenseQuery(balanceQueries.debts(householdId));
  const { user } = useAuth();
  const viewerId = user?.id ?? '';

  return (
    <>
      <PageTitle title={household.name} />
      <PageHeader title={`${greeting(new Date().getHours())}, ${user?.displayName ?? ''}`} />
      <div className="space-y-6">
        <BalanceOverview household={household} balances={balances} viewerId={viewerId} />
        <SettlementList household={household} viewerId={viewerId} />
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
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
      </div>

      {/* The settle up dialog renders over the overview. */}
      <Outlet />
    </>
  );
}
