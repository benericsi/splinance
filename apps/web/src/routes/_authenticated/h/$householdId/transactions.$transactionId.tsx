import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { TransactionDialog } from '@/features/transactions/components/transaction-dialog';
import { transactionQueries } from '@/features/transactions/queries';
import { ApiError } from '@/lib/http';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the edit dialog renders over the transactions list (see its <Outlet />). */
export const Route = createFileRoute('/_authenticated/h/$householdId/transactions/$transactionId')({
  loader: async ({ context: { queryClient }, params: { householdId, transactionId } }) => {
    try {
      await queryClient.query(transactionQueries.detail(householdId, transactionId));
    } catch (error) {
      // Deleted, private to someone else, or a mistyped link: back to the list.
      if (error instanceof ApiError && error.status === 404) {
        toast.error('That transaction does not exist any more.');
        throw redirect({
          to: '/h/$householdId/transactions',
          params: { householdId },
          replace: true,
        });
      }
      throw error;
    }
  },
  component: EditTransactionRoute,
});

function EditTransactionRoute() {
  const { householdId, transactionId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: transaction } = useSuspenseQuery(
    transactionQueries.detail(householdId, transactionId),
  );
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

  return (
    <TransactionDialog
      // A different transaction (or a reload after a conflict) starts a fresh form.
      key={transaction.id}
      household={household}
      categories={categories}
      transaction={transaction}
      onClose={close}
    />
  );
}
