import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { HouseholdAvatar } from '@/components/household-avatar';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { householdQueries } from '@/features/households/queries';
import { useAuth } from '@/lib/auth-store';

export const Route = createFileRoute('/_authenticated/h/$householdId/settings')({
  component: SettingsPage,
});

const ROLE_LABELS = { owner: 'Owner', member: 'Member' } as const;

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

function SettingsPage() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { user } = useAuth();

  return (
    <>
      <PageTitle title={`Settings · ${household.name}`} />
      <PageHeader title="Household settings" description="Details and members." />
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center gap-4">
            <HouseholdAvatar household={household} size={48} decorative />
            <div className="min-w-0">
              <p className="font-heading truncate text-lg font-semibold">{household.name}</p>
              <p className="text-muted-foreground text-sm">
                {household.baseCurrency} · created{' '}
                {dateFormat.format(new Date(household.createdAt))}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {household.members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <UserAvatar user={{ id: member.userId, displayName: member.displayName }} />
                  <span className="min-w-0 flex-1 truncate">
                    {member.displayName}
                    {member.userId === user?.id && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </span>
                  <Badge variant={member.role === 'owner' ? 'secondary' : 'outline'}>
                    {ROLE_LABELS[member.role]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
