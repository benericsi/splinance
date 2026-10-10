import { monthSchema } from '@splinance/shared';
import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { Button, buttonVariants } from '@/components/ui/button';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { MonthHeader } from '@/features/transactions/components/month-header';
import { TransactionList } from '@/features/transactions/components/transaction-list';
import { currentMonth, formatMonth } from '@/features/transactions/dates';
import { transactionQueries } from '@/features/transactions/queries';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';

/** No month in the URL means the current one, so a bookmark always opens "now". */
const searchSchema = z.object({ month: monthSchema.optional().catch(undefined) });

export const Route = createFileRoute('/_authenticated/h/$householdId/transactions')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { month } }) => {
    await Promise.all([
      queryClient.infiniteQuery(transactionQueries.list(householdId, month)),
      queryClient.query(transactionQueries.summary(householdId, month)),
      queryClient.query(categoryQueries.list(householdId)),
    ]);
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const { householdId } = Route.useParams();
  const { month } = Route.useLoaderDeps();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: summary } = useSuspenseQuery(transactionQueries.summary(householdId, month));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const list = useSuspenseInfiniteQuery(transactionQueries.list(householdId, month));
  const transactions = list.data.pages.flatMap((page) => page.transactions);

  return (
    <>
      <PageTitle title={`Transactions · ${household.name}`} />
      <PageHeader
        title="Transactions"
        actions={<AddLink householdId={householdId} className="max-md:hidden" />}
      />
      <MonthHeader month={month} summary={summary} />

      {transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <h2 className="font-heading text-lg font-semibold">Add your first transaction</h2>
          <p className="text-muted-foreground mx-auto mt-1 mb-5 max-w-sm">
            Expenses and income you add for {formatMonth(month)} show up here.
          </p>
          <AddLink householdId={householdId} label="Add transaction" />
        </div>
      ) : (
        <TransactionList
          householdId={householdId}
          transactions={transactions}
          categories={categories}
        />
      )}

      {list.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      {/* Phones: a floating button above the bottom tabs. */}
      <Link
        to="/h/$householdId/transactions/new"
        params={{ householdId }}
        search={true}
        state={OPEN_MODAL_STATE}
        aria-label="Add transaction"
        className={cn(
          buttonVariants({ size: 'icon-lg' }),
          'fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg md:hidden [&_svg:not([class*=size-])]:size-6',
        )}
      >
        <Plus aria-hidden />
      </Link>

      {/* Add and edit dialogs render over the list. */}
      <Outlet />
    </>
  );
}

function AddLink({
  householdId,
  label = 'Add',
  className,
}: {
  householdId: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      to="/h/$householdId/transactions/new"
      params={{ householdId }}
      search={true}
      state={OPEN_MODAL_STATE}
      className={cn(buttonVariants({ size: 'lg' }), className)}
    >
      <Plus aria-hidden />
      {label}
    </Link>
  );
}
