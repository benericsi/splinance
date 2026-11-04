import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback } from 'react';
import { ChangePasswordDialog } from '@/features/account/components/change-password-dialog';
import { accountQueries } from '@/features/account/queries';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the change password dialog over the account page (see its <Outlet />). */
export const Route = createFileRoute('/_authenticated/account/password')({
  loader: async ({ context: { queryClient } }) => {
    const account = await queryClient.query(accountQueries.detail());
    // Nothing to change without a password; a pasted link just shows the account page.
    if (!account.hasPassword) throw redirect({ to: '/account', replace: true });
  },
  component: PasswordRoute,
});

function PasswordRoute() {
  const navigate = Route.useNavigate();
  const { data: account } = useSuspenseQuery(accountQueries.detail());
  const toAccount = useCallback(() => {
    void navigate({ to: '/account', replace: true });
  }, [navigate]);
  const close = useCloseModal(toAccount);

  return <ChangePasswordDialog user={account.user} onClose={close} onDone={toAccount} />;
}
