import type { SavingsGoal } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MaskMoney } from '@/features/transactions/components/amount';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { goalProgress } from '../view';
import { GoalBar } from './goal-bar';
import { PinButton } from './pin-button';

/**
 * A goal in short: name, amount, how far it is. The whole tile opens the goal (the link's
 * `after` covers it); the pin sits above that as its own control. Closed goals get no pin.
 */
export function GoalTile({
  householdId,
  goal,
  fills,
}: {
  householdId: string;
  goal: SavingsGoal;
  fills: Map<string, string>;
}) {
  const { t } = useTranslation('savings');
  const { percent } = goalProgress(goal);
  const target =
    goal.targetAmount === null
      ? t('noTarget')
      : `${t('of', { amount: formatMoney(goal.targetAmount, goal.currency) })} · ${t('percent', { percent })}`;

  return (
    <div className="hover:bg-muted/40 has-focus-visible:ring-ring/50 relative rounded-xl border p-4 has-[a:focus-visible]:ring-[3px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 font-medium">
          {goal.visibility === 'private' && (
            <Lock className="text-muted-foreground size-3.5 shrink-0" aria-label={t('private')} />
          )}
          <Link
            to="/h/$householdId/savings/$goalId"
            params={{ householdId, goalId: goal.id }}
            state={OPEN_MODAL_STATE}
            className="truncate outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {goal.name}
          </Link>
        </h3>
        {goal.archivedAt === null && (
          <PinButton householdId={householdId} goal={goal} className="relative -mt-1.5 -mr-1.5" />
        )}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        <MoneyFlow minor={goal.balance} currency={goal.currency} />
      </p>
      <p className="text-muted-foreground mb-2.5 text-xs tabular-nums">
        <MaskMoney>{target}</MaskMoney>
      </p>
      <GoalBar goal={goal} fills={fills} />
    </div>
  );
}
