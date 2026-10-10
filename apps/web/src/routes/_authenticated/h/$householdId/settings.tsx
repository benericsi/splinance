import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { CategoriesCard } from '@/features/categories/components/categories-card';
import { categoryQueries } from '@/features/categories/queries';
import { DangerZone } from '@/features/households/components/danger-zone';
import { HouseholdDetailsCard } from '@/features/households/components/household-details-card';
import { MemberList } from '@/features/households/components/member-list';
import { householdQueries } from '@/features/households/queries';

export const Route = createFileRoute('/_authenticated/h/$householdId/settings')({
  loader: ({ context: { queryClient }, params: { householdId } }) =>
    queryClient.query(categoryQueries.list(householdId)),
  component: SettingsPage,
});

function SettingsPage() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));

  return (
    <>
      <PageTitle title={`Settings · ${household.name}`} />
      <PageHeader title="Household settings" description="Details, members and categories." />
      <div className="space-y-6">
        <HouseholdDetailsCard household={household} />
        <MemberList household={household} />
        <CategoriesCard householdId={householdId} categories={categories} />
        <DangerZone household={household} />
      </div>
      {/* Page-bound modals (invite, category) render over this page. */}
      <Outlet />
    </>
  );
}
