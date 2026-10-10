import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { CategoryDialog } from '@/features/categories/components/category-dialog';
import { categoryQueries } from '@/features/categories/queries';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the edit dialog renders over the settings page. */
export const Route = createFileRoute(
  '/_authenticated/h/$householdId/settings/categories/$categoryId',
)({
  loader: async ({ context: { queryClient }, params: { householdId, categoryId } }) => {
    const categories = await queryClient.query(categoryQueries.list(householdId));
    // Archived categories are read only (restore them first); unknown ids go back too.
    if (!categories.some((c) => c.id === categoryId && c.archivedAt === null)) {
      toast.error('That category cannot be edited.');
      throw redirect({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }
  },
  component: EditCategoryRoute,
});

function EditCategoryRoute() {
  const { householdId, categoryId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const category = categories.find((c) => c.id === categoryId);
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return (
    <CategoryDialog
      key={categoryId}
      householdId={householdId}
      categories={categories}
      category={category}
      onClose={close}
    />
  );
}
