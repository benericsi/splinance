import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { PasswordDialog } from '@/features/account/components/password-dialog';
import { accountQueries } from '@/features/account/queries';
import { useCloseModal } from '@/lib/route-modal';

/**
 * Child route: change the password, or set a first one, over the account page (see its
 * <Outlet />). A re-authentication with a provider comes back to this URL.
 */
export const Route = createFileRoute('/_authenticated/account/password')({
  loader: ({ context: { queryClient } }) => queryClient.query(accountQueries.detail()),
  component: PasswordRoute,
});

function PasswordRoute() {
  const navigate = Route.useNavigate();
  const { data: account } = useSuspenseQuery(accountQueries.detail());
  const toAccount = useCallback(() => {
    void navigate({ to: '/account', replace: true });
  }, [navigate]);
  const close = useCloseModal(toAccount);

  return <PasswordDialog account={account} onClose={close} onDone={toAccount} />;
}
