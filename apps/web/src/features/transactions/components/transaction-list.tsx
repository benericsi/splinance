import type { Category, Transaction } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { useAuth } from '@/lib/auth-store';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { formatDayHeading } from '../dates';
import { describeTransaction, signedAmount, viewerShare } from '../describe';
import { formatMoney } from '../money';

interface DayGroup {
  day: string;
  transactions: Transaction[];
  total: number;
}

/** The list arrives newest first, so consecutive rows of one day are already together. */
function groupByDay(transactions: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const transaction of transactions) {
    let group = groups.at(-1);
    if (group?.day !== transaction.occurredOn) {
      group = { day: transaction.occurredOn, transactions: [], total: 0 };
      groups.push(group);
    }
    group.transactions.push(transaction);
    group.total += signedAmount(transaction);
  }
  return groups;
}

export function TransactionList({
  householdId,
  transactions,
  categories,
}: {
  householdId: string;
  transactions: Transaction[];
  categories: Category[];
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <div className="space-y-6">
      {groupByDay(transactions).map((group) => (
        <section key={group.day} aria-label={formatDayHeading(group.day)}>
          <div className="text-muted-foreground flex items-baseline justify-between border-b px-1 pb-2 text-xs font-medium">
            <h2>{formatDayHeading(group.day)}</h2>
            <span className="tabular-nums">
              {formatMoney(group.total, group.transactions[0]?.currency ?? 'HUF', { signed: true })}
            </span>
          </div>
          <ul>
            {group.transactions.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow
                  householdId={householdId}
                  transaction={transaction}
                  category={
                    transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TransactionRow({
  householdId,
  transaction,
  category,
}: {
  householdId: string;
  transaction: Transaction;
  category: Category | undefined;
}) {
  const { user } = useAuth();
  const share = viewerShare(transaction, user?.id);
  const income = transaction.kind === 'income';

  return (
    <Link
      to="/h/$householdId/transactions/$transactionId"
      params={{ householdId, transactionId: transaction.id }}
      search={true}
      state={OPEN_MODAL_STATE}
      className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-1 flex items-center gap-3 rounded-lg px-1 py-2.5 outline-none focus-visible:ring-[3px]"
    >
      <CategoryTile category={category} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{transaction.description}</span>
          {transaction.visibility === 'private' && (
            <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Private" />
          )}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {category ? `${category.name} · ` : ''}
          {describeTransaction(transaction, user?.id)}
        </p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className={cn('font-medium', income && 'text-positive')}>
          {formatMoney(signedAmount(transaction), transaction.currency, { signed: true })}
        </p>
        {share !== undefined && transaction.split && transaction.split.shares.length > 1 && (
          <p className="text-muted-foreground text-xs">
            you {formatMoney(share, transaction.currency)}
          </p>
        )}
      </div>
    </Link>
  );
}
