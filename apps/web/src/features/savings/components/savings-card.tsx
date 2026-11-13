import type { Savings } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Amount, MaskMoney } from '@/features/transactions/components/amount';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { stepText } from '../describe';
import { arrangeGoals, memberFills } from '../view';
import { GoalBar } from './goal-bar';

/** The overview has room for a few; the page has them all. */
const MAX_GOALS = 3;

/**
 * Overview: the goals the viewer keeps on top of their savings page (their pins, or the one
 * picked for them; any open goal when there is neither), each with its bar and what is
 * missing to the next step. Hidden while there is no open goal.
 */
export function SavingsCard({
  householdId,
  savings,
  viewerId,
}: {
  householdId: string;
  savings: Savings;
  viewerId: string;
}) {
  const { t } = useTranslation('savings');
  const { featured, rest } = arrangeGoals(savings.goals);
  const goals = (featured.length > 0 ? featured : rest).slice(0, MAX_GOALS);
  if (goals.length === 0) return null;
  const fills = memberFills(savings.goals, viewerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('card.title')}</CardTitle>
        <CardAction>
          <Link
            to="/h/$householdId/savings"
            params={{ householdId }}
            className={buttonVariants({ variant: 'link', className: 'h-auto px-0' })}
          >
            {t('card.all')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {goals.map((goal) => {
            const step = stepText(goal);
            return (
              <li key={goal.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    to="/h/$householdId/savings/$goalId"
                    params={{ householdId, goalId: goal.id }}
                    state={OPEN_MODAL_STATE}
                    className="focus-visible:ring-ring/50 min-w-0 truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                  >
                    {goal.name}
                  </Link>
                  <span className="shrink-0 tabular-nums">
                    <Amount minor={goal.balance} currency={goal.currency} />
                    {goal.targetAmount !== null && (
                      <span className="text-muted-foreground">
                        {' '}
                        <MaskMoney>
                          {t('of', { amount: formatMoney(goal.targetAmount, goal.currency) })}
                        </MaskMoney>
                      </span>
                    )}
                  </span>
                </div>
                <GoalBar goal={goal} fills={fills} />
                {step && (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    <MaskMoney>{step}</MaskMoney>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
