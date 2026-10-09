import { noop, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { healthQueries } from '@/features/health/queries';
import { StatusPanel } from '@/features/health/status-panel';
import { householdQueries } from '@/features/households/queries';
import { useAuth } from '@/lib/auth-store';

export const Route = createFileRoute('/_authenticated/h/$householdId/')({
  // Errors are swallowed here because the status panel renders them from the query state.
  loader: ({ context: { queryClient } }) => {
    void queryClient.query(healthQueries.live()).catch(noop);
    void queryClient.query(healthQueries.ready()).catch(noop);
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
  const { user } = useAuth();

  return (
    <>
      <PageTitle title={household.name} />
      <PageHeader
        title={`${greeting(new Date().getHours())}, ${user?.displayName ?? ''}`}
        description={`This is ${household.name}. Shared expenses and balances are next on the roadmap.`}
      />
      <div className="space-y-6">
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
        <StatusPanel />
      </div>
    </>
  );
}
