import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SkeletonCard, SkeletonLine } from '@/components/skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountLayout } from '@/features/account/components/account-layout';
import { DeleteAccountCard } from '@/features/account/components/delete-account-card';
import { OtherDevicesCard } from '@/features/account/components/other-devices-card';
import { ProfileCard } from '@/features/account/components/profile-card';
import { SignInMethodsCard } from '@/features/account/components/sign-in-methods-card';
import { accountQueries } from '@/features/account/queries';

/** The signed-in person's own settings (not household-scoped); not on the demo site. */
export const Route = createFileRoute('/_authenticated/account')({
  beforeLoad: () => {
    if (__DEMO_SITE__) throw redirect({ to: '/', replace: true });
  },
  loader: ({ context: { queryClient } }) => queryClient.query(accountQueries.detail()),
  component: AccountPage,
  pendingComponent: AccountSkeleton,
});

function AccountPage() {
  const { data: account } = useSuspenseQuery(accountQueries.detail());

  return (
    <AccountLayout>
      <PageTitle title="Account settings" />
      <RevealPage>
        <AccountHeader />
        <div className="space-y-6">
          <Reveal index={0}>
            <ProfileCard user={account.user} />
          </Reveal>
          <Reveal index={1}>
            <SignInMethodsCard account={account} />
          </Reveal>
          <Reveal index={2}>
            <OtherDevicesCard />
          </Reveal>
          <Reveal index={3}>
            <DeleteAccountCard />
          </Reveal>
        </div>
      </RevealPage>
      {/* Page-bound modals (change password) render over this page. */}
      <Outlet />
    </AccountLayout>
  );
}

function AccountHeader() {
  return <PageHeader title="Account settings" description="Your profile and how you sign in." />;
}

function AccountSkeleton() {
  return (
    <AccountLayout>
      <PageSkeleton>
        <AccountHeader />
        <div className="space-y-6">
          <Card>
            <CardContent className="flex items-center gap-4">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1">
                <SkeletonLine line="h-7" className="w-40" />
                <SkeletonLine className="w-52" />
              </div>
            </CardContent>
          </Card>
          <SkeletonCard title="w-32">
            {[0, 1].map((index) => (
              <div key={index} className="flex items-center gap-3 py-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <SkeletonLine className="w-20" />
                  <SkeletonLine className="w-48" />
                </div>
              </div>
            ))}
          </SkeletonCard>
        </div>
      </PageSkeleton>
    </AccountLayout>
  );
}
