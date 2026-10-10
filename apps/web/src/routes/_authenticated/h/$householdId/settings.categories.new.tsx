import { categoryKindSchema } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { CategoryDialog } from '@/features/categories/components/category-dialog';
import { categoryQueries } from '@/features/categories/queries';
import { useCloseModal } from '@/lib/route-modal';

/** `?kind=income` preselects the kind (the card passes the tab that was open). */
const searchSchema = z.object({ kind: categoryKindSchema.optional().catch(undefined) });

/** Child route: the new category dialog renders over the settings page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/settings/categories/new')({
  validateSearch: searchSchema,
  component: NewCategoryRoute,
});

function NewCategoryRoute() {
  const { householdId } = Route.useParams();
  const { kind } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return (
    <CategoryDialog
      householdId={householdId}
      categories={categories}
      initialKind={kind ?? 'expense'}
      onClose={close}
    />
  );
}
