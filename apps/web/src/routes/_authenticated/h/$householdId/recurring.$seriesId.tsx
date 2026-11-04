import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useCallback } from 'react';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { SeriesDialog } from '@/features/recurring/components/series-dialog';
import { recurringQueries } from '@/features/recurring/queries';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: a series (payments, edit, stop tracking) over the recurring page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/recurring/$seriesId')({
  loader: async ({ context: { queryClient }, params: { householdId, seriesId } }) => {
    const list = await queryClient.query(recurringQueries.list(householdId));
    if (!list.series.some((series) => series.id === seriesId)) throw notFound();
  },
  component: SeriesRoute,
});

function SeriesRoute() {
  const { householdId, seriesId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data } = useSuspenseQuery(recurringQueries.list(householdId));
  const series = data.series.find((item) => item.id === seriesId);
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/recurring', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );
  // Stopped from this dialog: the list no longer has it while the dialog plays its exit.
  if (!series) return null;

  return (
    <SeriesDialog
      key={series.id}
      householdId={householdId}
      currency={household.baseCurrency}
      categories={categories.filter(
        (c) => c.kind === 'expense' && (c.archivedAt === null || c.id === series.categoryId),
      )}
      series={series}
      onClose={close}
    />
  );
}
