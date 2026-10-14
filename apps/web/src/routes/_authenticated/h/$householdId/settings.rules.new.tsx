import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { categoryQueries } from '@/features/categories/queries';
import { RuleDialog } from '@/features/rules/components/rule-dialog';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the new rule dialog renders over the settings page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/settings/rules/new')({
  component: NewRuleRoute,
});

function NewRuleRoute() {
  const { householdId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return <RuleDialog householdId={householdId} categories={categories} onClose={close} />;
}
