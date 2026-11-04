import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { DeleteAccountDialog } from '@/features/account/components/delete-account-dialog';
import { accountQueries } from '@/features/account/queries';
import { useCloseModal } from '@/lib/route-modal';

/**
 * Child route: delete the account, over the account page (see its <Outlet />). Loads the
 * preview first; a re-authentication with a provider comes back to this URL.
 */
export const Route = createFileRoute('/_authenticated/account/delete')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.query(accountQueries.detail()),
      // Never a cached preview: staleTime 0 refetches it on every opening.
      queryClient.query(accountQueries.deletion()),
    ]),
  component: DeleteRoute,
});

function DeleteRoute() {
  const navigate = Route.useNavigate();
  const { data: account } = useSuspenseQuery(accountQueries.detail());
  const { data: preview } = useSuspenseQuery(accountQueries.deletion());
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/account', replace: true });
    }, [navigate]),
  );

  return <DeleteAccountDialog account={account} preview={preview} onClose={close} />;
}
