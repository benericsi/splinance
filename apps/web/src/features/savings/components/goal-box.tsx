import type { SavingsGoal } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Lock, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Amount, MaskMoney } from '@/features/transactions/components/amount';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { today } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { formatGoalDate, paceText, stepText } from '../describe';
import { goalProgress } from '../view';
import { GoalBar } from './goal-bar';
import { PinButton } from './pin-button';

/** "Shared · by 1 Jul 2027": who sees the goal and when it is due. */
export function GoalMeta({ goal }: { goal: SavingsGoal }) {
  const { t } = useTranslation('savings');
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      {goal.visibility === 'private' && <Lock className="size-3.5 shrink-0" aria-hidden />}
      <span>
        {t(goal.visibility)}
        {goal.targetDate && ` · ${t('by', { date: formatGoalDate(goal.targetDate) })}`}
      </span>
    </p>
  );
}

/** Who has how much in the goal, with the bar's colors. */
export function GoalLegend({
  goal,
  fills,
  viewerId,
}: {
  goal: SavingsGoal;
  fills: Map<string, string>;
  viewerId: string;
}) {
  const { t } = useTranslation('savings');
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {goal.contributions.map((part) => (
        <li key={part.userId} className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-2 shrink-0 rounded-[2px]',
              part.amount > 0 ? (fills.get(part.userId) ?? 'bg-positive') : 'bg-muted',
            )}
            aria-hidden
          />
          <span className="text-muted-foreground">
            {part.userId === viewerId ? t('you') : part.displayName}
          </span>
          <Amount minor={part.amount} currency={goal.currency} className="tabular-nums" />
        </li>
      ))}
    </ul>
  );
}

/**
 * A goal shown large: the amount, the bar with its milestones, who put in what, what is
 * missing to the next step and what it takes to arrive in time. The viewer's pins, or the
 * goal picked for them while they have none.
 */
export function GoalBox({
  householdId,
  goal,
  fills,
  viewerId,
}: {
  householdId: string;
  goal: SavingsGoal;
  fills: Map<string, string>;
  viewerId: string;
}) {
  const { t } = useTranslation('savings');
  const progress = goalProgress(goal);
  const step = stepText(goal);
  const pace = paceText(goal, today());

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <GoalMeta goal={goal} />
            <h2 className="font-heading truncate text-lg font-semibold">
              <Link
                to="/h/$householdId/savings/$goalId"
                params={{ householdId, goalId: goal.id }}
                state={OPEN_MODAL_STATE}
                className="focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
              >
                {goal.name}
              </Link>
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <PinButton householdId={householdId} goal={goal} />
            <Link
              to="/h/$householdId/savings/$goalId"
              params={{ householdId, goalId: goal.id }}
              state={OPEN_MODAL_STATE}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Plus aria-hidden />
              {t('addMoney')}
            </Link>
          </div>
        </div>

        <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
            <MoneyFlow minor={goal.balance} currency={goal.currency} />
          </span>
          <span className="text-muted-foreground tabular-nums">
            {goal.targetAmount === null ? (
              t('noTarget')
            ) : (
              <MaskMoney>
                {t('of', { amount: formatMoney(goal.targetAmount, goal.currency) })}
              </MaskMoney>
            )}
          </span>
        </p>

        <div className="mt-3">
          <GoalBar goal={goal} fills={fills} milestones />
          {goal.targetAmount !== null && (
            <p className="sr-only">{t('milestones', { passed: progress.passed.length })}</p>
          )}
        </div>

        {goal.contributions.length > 1 && (
          <div className="mt-2.5">
            <GoalLegend goal={goal} fills={fills} viewerId={viewerId} />
          </div>
        )}

        {(step ?? pace) && (
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            {step && (
              <p
                className={progress.reached ? 'text-positive font-medium' : 'text-muted-foreground'}
              >
                <MaskMoney>{step}</MaskMoney>
              </p>
            )}
            {pace && (
              <p className={pace.overdue ? 'text-warning' : undefined}>
                <MaskMoney>{pace.text}</MaskMoney>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
