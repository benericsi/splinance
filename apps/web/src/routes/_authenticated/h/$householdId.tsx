import { noop, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound, Outlet } from '@tanstack/react-router';
import { StatusPage } from '@/components/status-page';
import { buttonVariants } from '@/components/ui/button';
import { HouseholdShell } from '@/features/households/components/household-shell';
import { rememberLastHousehold } from '@/features/households/last-household';
import { householdQueries } from '@/features/households/queries';
import { ApiError } from '@/lib/http';

export const Route = createFileRoute('/_authenticated/h/$householdId')({
  loader: async ({ context: { queryClient, auth }, params: { householdId } }) => {
    // The switcher needs the list; it must not block the page.
    void queryClient.query(householdQueries.list()).catch(noop);
    try {
      await queryClient.query(householdQueries.detail(householdId));
    } catch (error) {
      // The API answers 404 for unknown ids and for households the user is not in.
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
    const userId = auth.getState().user?.id;
    if (userId) rememberLastHousehold(userId, householdId);
  },
  component: HouseholdLayout,
  notFoundComponent: HouseholdNotFound,
});

function HouseholdLayout() {
  const { householdId } = Route.useParams();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));

  return (
    <HouseholdShell household={household}>
      <Outlet />
    </HouseholdShell>
  );
}

function HouseholdNotFound() {
  return (
    <StatusPage
      fullPage
      code="404"
      title="Household not found"
      description="It does not exist, was archived, or you are not a member."
      actions={
        <Link to="/" className={buttonVariants()}>
          Back to home
        </Link>
      }
    />
  );
}
