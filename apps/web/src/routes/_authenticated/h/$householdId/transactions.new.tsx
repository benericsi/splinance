import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { TransactionDialog } from '@/features/transactions/components/transaction-dialog';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the add dialog renders over the transactions list (see its <Outlet />). */
export const Route = createFileRoute('/_authenticated/h/$householdId/transactions/new')({
  component: NewTransactionRoute,
});

function NewTransactionRoute() {
  const { householdId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({
        to: '/h/$householdId/transactions',
        params: { householdId },
        search: true,
        replace: true,
      });
    }, [navigate, householdId]),
  );

  return <TransactionDialog household={household} categories={categories} onClose={close} />;
}
