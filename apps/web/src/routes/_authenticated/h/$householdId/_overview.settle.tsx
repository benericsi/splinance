import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { SettleUpDialog } from '@/features/balances/components/settle-up-dialog';
import { balanceQueries } from '@/features/balances/queries';
import { householdQueries } from '@/features/households/queries';
import { useAuth } from '@/lib/auth-store';
import { useCloseModal } from '@/lib/route-modal';

/** `with`: the person to settle with; a bad or missing id falls back to the largest debt. */
const searchSchema = z.object({ with: z.uuid().optional().catch(undefined) });

/** Child route: the settle up dialog renders over the overview (see its <Outlet />). */
export const Route = createFileRoute('/_authenticated/h/$householdId/_overview/settle')({
  validateSearch: searchSchema,
  component: SettleUpRoute,
});

function SettleUpRoute() {
  const { householdId } = Route.useParams();
  const { with: requestedUserId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: balances } = useSuspenseQuery(balanceQueries.debts(householdId));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return (
    <SettleUpDialog
      household={household}
      balances={balances}
      viewerId={user?.id ?? ''}
      requestedUserId={requestedUserId}
      onClose={close}
    />
  );
}
