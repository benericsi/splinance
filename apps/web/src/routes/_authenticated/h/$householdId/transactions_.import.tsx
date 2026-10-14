import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { buttonVariants } from '@/components/ui/button';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { ImportPage } from '@/features/imports/components/import-page';
import { importQueries } from '@/features/imports/queries';
import { ruleQueries } from '@/features/rules/queries';
import { useAuth } from '@/lib/auth-store';

/**
 * A page of its own, not a dialog over the list (`transactions_` opts out of nesting):
 * reviewing a long statement is real work and needs the room.
 */
export const Route = createFileRoute('/_authenticated/h/$householdId/transactions_/import')({
  loader: async ({ context: { queryClient }, params: { householdId } }) => {
    await Promise.all([
      queryClient.query(categoryQueries.list(householdId)),
      queryClient.query(importQueries.list(householdId)),
      queryClient.query(ruleQueries.list(householdId)),
    ]);
  },
  component: ImportRoute,
});

function ImportRoute() {
  const { householdId } = Route.useParams();
  const { user } = useAuth();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: rules } = useSuspenseQuery(ruleQueries.list(householdId));

  return (
    <>
      <PageTitle title={`Import · ${household.name}`} />
      <Link
        to="/h/$householdId/transactions"
        params={{ householdId }}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 mb-2' })}
      >
        <ArrowLeft aria-hidden />
        Transactions
      </Link>
      <PageHeader title="Import from your bank" />
      <ImportPage
        household={household}
        categories={categories}
        rules={rules}
        viewerId={user?.id ?? ''}
      />
    </>
  );
}
