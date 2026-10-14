import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { categoryQueries } from '@/features/categories/queries';
import { RuleDialog } from '@/features/rules/components/rule-dialog';
import { ruleQueries } from '@/features/rules/queries';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the edit dialog renders over the settings page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/settings/rules/$ruleId')({
  loader: async ({ context: { queryClient }, params: { householdId, ruleId } }) => {
    const rules = await queryClient.query(ruleQueries.list(householdId));
    if (!rules.some((rule) => rule.id === ruleId)) {
      toast.error('That rule does not exist any more.');
      throw redirect({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }
  },
  component: EditRuleRoute,
});

function EditRuleRoute() {
  const { householdId, ruleId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: rules } = useSuspenseQuery(ruleQueries.list(householdId));
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/settings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return (
    <RuleDialog
      key={ruleId}
      householdId={householdId}
      categories={categories}
      rule={rules.find((rule) => rule.id === ruleId)}
      onClose={close}
    />
  );
}
