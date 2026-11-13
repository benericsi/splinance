import type { Balances, Debt, HouseholdDetail } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { TileBox } from '@/components/tile';
import { UserAvatar } from '@/components/user-avatar';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { counterpart, describeDebt, splitDebts } from '../debts';
import { Amount } from '@/features/transactions/components/amount';

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
  const { t } = useTranslation('balances');
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
      {t('settleUp')}
    </Link>
  );
}

/**
 * The overview's balance tile: the viewer's largest debt as a big line with "Settle up",
 * the rest of the household's debts below it. Two people (the common case) see one line.
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
  const { t } = useTranslation('balances');
  const { mine, others } = splitDebts(balances.debts, viewerId);
  const [hero, ...rest] = mine;
  const alsoInId = useId();

  return (
    <TileBox title={t('heading')}>
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
        <section aria-labelledby={alsoInId} className="mt-4 border-t pt-3">
          <h3 id={alsoInId} className="text-muted-foreground text-sm">
            {t('alsoIn', { household: household.name })}
          </h3>
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
                    className={cn('min-w-0 flex-1 truncate', !involved && 'text-muted-foreground')}
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
                    <Amount minor={debt.amount} currency={balances.currency} />
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
        </section>
      )}
    </TileBox>
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
  const { t } = useTranslation('balances');
  const person = counterpart(debt, viewerId);
  const owedToViewer = debt.to.userId === viewerId;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <UserAvatar user={{ id: person.userId, displayName: person.displayName }} size={32} />
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
          {t('viewTransactions')}
        </Link>
      </div>
    </div>
  );
}

function AllSquare({ household, othersOwe }: { household: HouseholdDetail; othersOwe: boolean }) {
  const { t } = useTranslation('balances');
  const alone = household.members.length < 2;
  return (
    <div className="flex items-start gap-3">
      <CircleCheck className="text-positive mt-0.5 size-6 shrink-0" aria-hidden />
      <div>
        <p className="font-heading text-lg font-semibold">{t('allSquare')}</p>
        <p className="text-muted-foreground">
          {alone
            ? t('alone')
            : othersOwe
              ? t('othersOwe')
              : t('nobodyOwes', { household: household.name })}
        </p>
      </div>
    </div>
  );
}
