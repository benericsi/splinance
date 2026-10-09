import { noop, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback } from 'react';
import { householdQueries } from '@/features/households/queries';
import { InviteDialog } from '@/features/invites/components/invite-dialog';
import { inviteQueries } from '@/features/invites/queries';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the invite dialog renders over the settings page (see its <Outlet />). */
export const Route = createFileRoute('/_authenticated/h/$householdId/settings/invite')({
  loader: async ({ context: { queryClient }, params: { householdId } }) => {
    const household = await queryClient.query(householdQueries.detail(householdId));
    // Only owners invite; a member with a pasted link just lands on the settings page.
    if (household.role !== 'owner') {
      throw redirect({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }
    void queryClient.query(inviteQueries.list(householdId)).catch(noop);
  },
  component: InviteRoute,
});

function InviteRoute() {
  const { householdId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return <InviteDialog household={household} onClose={close} />;
}
