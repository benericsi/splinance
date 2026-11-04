import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { SeriesDialog } from '@/features/recurring/components/series-dialog';
import { seriesValuesFrom } from '@/features/recurring/form';
import { transactionQueries } from '@/features/transactions/queries';
import { useCloseModal } from '@/lib/route-modal';

/** `from`: a transaction to start from ("Make recurring"). */
const searchSchema = z.object({ from: z.uuid().optional().catch(undefined) });

/** Child route: the add dialog renders over the recurring page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/recurring/new')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ from: search.from }),
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { from } }) => {
    // A transaction that is gone just means an empty form.
    if (from)
      await queryClient.query(transactionQueries.detail(householdId, from)).catch(() => null);
  },
  component: AddSeriesRoute,
});

function AddSeriesRoute() {
  const { householdId } = Route.useParams();
  const { from } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: transaction } = useQuery({
    ...transactionQueries.detail(householdId, from ?? ''),
    enabled: from !== undefined,
  });
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/recurring', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );
  const currency = household.baseCurrency;

  return (
    <SeriesDialog
      key={transaction?.id ?? 'new'}
      householdId={householdId}
      currency={currency}
      categories={categories.filter((c) => c.kind === 'expense' && c.archivedAt === null)}
      initialValues={
        transaction && transaction.kind === 'expense'
          ? seriesValuesFrom(transaction, currency)
          : undefined
      }
      onClose={close}
    />
  );
}
