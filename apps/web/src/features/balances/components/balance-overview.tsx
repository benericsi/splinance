import type { Balances, Debt, HouseholdDetail } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { counterpart, describeDebt, splitDebts } from '../debts';

/** Opens the settle up dialog for the debt with `userId`. */
function SettleLink({
  householdId,
  userId,
  primary = false,
  className,
}: {
  householdId: string;
  userId: string;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Link
      to="/h/$householdId/settle"
      params={{ householdId }}
      search={{ with: userId }}
      state={OPEN_MODAL_STATE}
      className={cn(
        buttonVariants(primary ? { size: 'lg' } : { variant: 'outline', size: 'sm' }),
        className,
      )}
    >
      Settle up
    </Link>
  );
}

/**
 * The top of the overview: the viewer's largest debt as a big line with "Settle up", the
 * rest of the household's debts below. Two people (the common case) see a single line.
 */
export function BalanceOverview({
  household,
  balances,
  viewerId,
}: {
  household: HouseholdDetail;
  balances: Balances;
  viewerId: string;
}) {
  const { mine, others } = splitDebts(balances.debts, viewerId);
  const [hero, ...rest] = mine;

  return (
    <section aria-labelledby="balance-heading" className="space-y-4">
      <h2 id="balance-heading" className="sr-only">
        Balance
      </h2>
      {hero ? (
        <HeroDebt
          householdId={household.id}
          debt={hero}
          viewerId={viewerId}
          currency={balances.currency}
        />
      ) : (
        <AllSquare household={household} othersOwe={others.length > 0} />
      )}

      {rest.length + others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Also in {household.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {[...rest, ...others].map((debt) => {
                const involved = debt.from.userId === viewerId || debt.to.userId === viewerId;
                const person = involved ? counterpart(debt, viewerId) : debt.from;
                return (
                  <li
                    key={`${debt.from.userId}-${debt.to.userId}`}
                    className="flex min-h-12 items-center gap-3 py-2"
                  >
                    <UserAvatar
                      user={{ id: person.userId, displayName: person.displayName }}
                      size={28}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        !involved && 'text-muted-foreground',
                      )}
                    >
                      {describeDebt(debt, viewerId)}
                    </span>
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        !involved
                          ? 'text-muted-foreground'
                          : debt.to.userId === viewerId
                            ? 'text-positive'
                            : 'text-negative',
                      )}
                    >
                      {formatMoney(debt.amount, balances.currency)}
                    </span>
                    {involved ? (
                      <SettleLink householdId={household.id} userId={person.userId} />
                    ) : (
                      // Keeps the amounts aligned with the rows that have a button.
                      <span className="w-[5.25rem] shrink-0" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function HeroDebt({
  householdId,
  debt,
  viewerId,
  currency,
}: {
  householdId: string;
  debt: Debt;
  viewerId: string;
  currency: Balances['currency'];
}) {
  const person = counterpart(debt, viewerId);
  const owedToViewer = debt.to.userId === viewerId;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <UserAvatar user={{ id: person.userId, displayName: person.displayName }} size={36} />
          <p className="text-muted-foreground">{describeDebt(debt, viewerId)}</p>
        </div>
        <p
          className={cn(
            'font-heading text-4xl font-semibold tracking-tight tabular-nums',
            owedToViewer ? 'text-positive' : 'text-negative',
          )}
        >
          <MoneyFlow minor={debt.amount} currency={currency} />
        </p>
        <div className="flex flex-wrap gap-2">
          <SettleLink householdId={householdId} userId={person.userId} primary />
          <Link
            to="/h/$householdId/transactions"
            params={{ householdId }}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            View transactions
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function AllSquare({ household, othersOwe }: { household: HouseholdDetail; othersOwe: boolean }) {
  const alone = household.members.length < 2;
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <CircleCheck className="text-positive mt-0.5 size-6 shrink-0" aria-hidden />
        <div>
          <p className="font-heading text-lg font-semibold">{"You're all square"}</p>
          <p className="text-muted-foreground">
            {alone
              ? 'Balances show up here once you share expenses with someone.'
              : othersOwe
                ? "You don't owe anyone, and nobody owes you."
                : `Nobody owes anybody in ${household.name}.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
