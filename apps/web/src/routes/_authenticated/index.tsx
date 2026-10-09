import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { House } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { buttonVariants } from '@/components/ui/button';
import { UserMenu } from '@/features/auth/components/user-menu';
import { readLastHousehold } from '@/features/households/last-household';
import { householdQueries } from '@/features/households/queries';
import { useAuth } from '@/lib/auth-store';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';

export const Route = createFileRoute('/_authenticated/')({
  // `/` is a dispatcher: open the household used last, else the first one.
  loader: async ({ context: { queryClient, auth } }) => {
    const households = await queryClient.query(householdQueries.list());
    const userId = auth.getState().user?.id;
    const last = userId ? readLastHousehold(userId) : undefined;
    const target = households.find((h) => h.id === last) ?? households[0];
    if (target) {
      throw redirect({
        to: '/h/$householdId',
        params: { householdId: target.id },
        search: true,
        replace: true,
      });
    }
  },
  component: NoHouseholdPage,
});

// Temporary until onboarding (/welcome) replaces it.
function NoHouseholdPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-svh flex-col">
      <PageTitle title="Create a household" />
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Logo className="text-lg [&_svg]:size-7" />
        {user && <UserMenu user={user} />}
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="max-w-sm text-center">
          <div className="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-xl">
            <House className="size-6" aria-hidden />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Create your first household
          </h1>
          <p className="text-muted-foreground mt-2">
            A household holds the expenses you share with a partner, flatmates or family.
          </p>
          <Link
            to="."
            search={{ modal: 'new-household' }}
            state={OPEN_MODAL_STATE}
            className={buttonVariants({ className: 'mt-6 h-10 px-4' })}
          >
            Create household
          </Link>
        </div>
      </main>
    </div>
  );
}
