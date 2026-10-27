import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SkeletonCard, SkeletonLine } from '@/components/skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoriesCard } from '@/features/categories/components/categories-card';
import { categoryQueries } from '@/features/categories/queries';
import { DangerZone } from '@/features/households/components/danger-zone';
import { HouseholdDetailsCard } from '@/features/households/components/household-details-card';
import { MemberList } from '@/features/households/components/member-list';
import { householdQueries } from '@/features/households/queries';
import { RulesCard } from '@/features/rules/components/rules-card';
import { ruleQueries } from '@/features/rules/queries';

export const Route = createFileRoute('/_authenticated/h/$householdId/settings')({
  loader: async ({ context: { queryClient }, params: { householdId } }) => {
    await Promise.all([
      queryClient.query(categoryQueries.list(householdId)),
      queryClient.query(ruleQueries.list(householdId)),
    ]);
  },
  component: SettingsPage,
  pendingComponent: SettingsSkeleton,
});

function SettingsPage() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: rules } = useSuspenseQuery(ruleQueries.list(householdId));

  return (
    <RevealPage>
      <PageTitle title={`Settings · ${household.name}`} />
      <SettingsHeader />
      <div className="space-y-6">
        <Reveal index={0}>
          <HouseholdDetailsCard household={household} />
        </Reveal>
        <Reveal index={1}>
          <MemberList household={household} />
        </Reveal>
        <Reveal index={2}>
          <CategoriesCard householdId={householdId} categories={categories} />
        </Reveal>
        <Reveal index={3}>
          <RulesCard householdId={householdId} rules={rules} categories={categories} />
        </Reveal>
        <Reveal index={4}>
          <DangerZone household={household} />
        </Reveal>
      </div>
      {/* Page-bound modals (invite, category) render over this page. */}
      <Outlet />
    </RevealPage>
  );
}

function SettingsHeader() {
  return (
    <PageHeader title="Household settings" description="Details, members, categories and rules." />
  );
}

/** The cards above the fold: details, members and the start of the categories. */
function SettingsSkeleton() {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => (
      <div key={index} className="flex items-center gap-3 py-2">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <SkeletonLine className="w-32" />
      </div>
    ));
  return (
    <PageSkeleton>
      <SettingsHeader />
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center gap-4">
            <Skeleton className="size-12 shrink-0 rounded-xl" />
            <SkeletonLine line="h-7" className="w-40" />
          </CardContent>
        </Card>
        <SkeletonCard title="w-24">{rows(2)}</SkeletonCard>
        <SkeletonCard title="w-28">{rows(4)}</SkeletonCard>
      </div>
    </PageSkeleton>
  );
}
