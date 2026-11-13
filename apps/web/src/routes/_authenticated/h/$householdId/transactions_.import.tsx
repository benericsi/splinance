import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { ImportPage } from '@/features/imports/components/import-page';
import { importQueries } from '@/features/imports/queries';
import { recurringQueries } from '@/features/recurring/queries';
import { ruleQueries } from '@/features/rules/queries';
import { savingsQueries } from '@/features/savings/queries';
import { currentMonth } from '@/features/transactions/dates';
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
      queryClient.query(recurringQueries.list(householdId)),
      queryClient.query(savingsQueries.month(householdId, currentMonth())),
      queryClient.query(savingsQueries.rules(householdId)),
    ]);
  },
  component: ImportRoute,
  pendingComponent: ImportSkeleton,
});

function ImportRoute() {
  const { t } = useTranslation('transactions');
  const { householdId } = Route.useParams();
  const { user } = useAuth();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: rules } = useSuspenseQuery(ruleQueries.list(householdId));
  const { data: recurring } = useSuspenseQuery(recurringQueries.list(householdId));
  const { data: savings } = useSuspenseQuery(savingsQueries.month(householdId, currentMonth()));
  const { data: savingsRules } = useSuspenseQuery(savingsQueries.rules(householdId));

  return (
    <RevealPage>
      <PageTitle title={t('importPage.pageTitle', { household: household.name })} />
      <Link
        to="/h/$householdId/transactions"
        params={{ householdId }}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 mb-2' })}
      >
        <ArrowLeft aria-hidden />
        {t('title')}
      </Link>
      <PageHeader title={t('importPage.title')} />
      <Reveal index={0}>
        <ImportPage
          household={household}
          categories={categories}
          rules={rules}
          series={recurring.series}
          goals={savings.goals.filter((goal) => goal.archivedAt === null)}
          savingsRules={savingsRules}
          viewerId={user?.id ?? ''}
        />
      </Reveal>
    </RevealPage>
  );
}

/** The back link and the file picker; the history only shows once there is one. */
function ImportSkeleton() {
  const { t } = useTranslation('transactions');
  return (
    <PageSkeleton>
      <Skeleton className="mb-2 h-7 w-32 rounded-lg" />
      <PageHeader title={t('importPage.title')} />
      <Skeleton className="h-40 rounded-xl" />
    </PageSkeleton>
  );
}
