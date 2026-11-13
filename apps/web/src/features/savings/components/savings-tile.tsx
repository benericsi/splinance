import type { Savings } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Ring } from '@/components/arc-charts';
import { TileBox, TileLink } from '@/components/tile';
import { Amount, MaskMoney } from '@/features/transactions/components/amount';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { stepText } from '../describe';
import { goalProgress, overviewGoals, ringFraction } from '../view';

/**
 * Overview: a ring for each goal the viewer keeps on top of their savings page (their pins,
 * or the one picked for them; any open goal when there is neither), two at most, each a
 * link to its dialog with the next step in words. One color: the ring is how far, not who.
 * Hidden while there is no open goal.
 */
export function SavingsTile({ householdId, savings }: { householdId: string; savings: Savings }) {
  const { t } = useTranslation('savings');
  const goals = overviewGoals(savings.goals);
  if (goals.length === 0) return null;

  return (
    <TileBox
      title={t('card.title')}
      action={
        <TileLink
          to="/h/$householdId/savings"
          params={{ householdId }}
          aria-label={t('card.all')}
        />
      }
    >
      <ul className="space-y-3">
        {goals.map((goal) => {
          const step = stepText(goal);
          const { percent } = goalProgress(goal);
          return (
            <li key={goal.id} className="flex items-center gap-3">
              <Ring
                ratio={ringFraction(goal) ?? 0}
                strokeClassName="stroke-positive"
                className="size-14 shrink-0"
              >
                {percent !== null && (
                  <span className="text-xs font-semibold tabular-nums">{percent}%</span>
                )}
              </Ring>
              <div className="min-w-0 flex-1 text-sm">
                <Link
                  to="/h/$householdId/savings/$goalId"
                  params={{ householdId, goalId: goal.id }}
                  state={OPEN_MODAL_STATE}
                  className="focus-visible:ring-ring/50 block truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                >
                  {goal.name}
                </Link>
                <p className="truncate tabular-nums">
                  <Amount minor={goal.balance} currency={goal.currency} />
                  {goal.targetAmount !== null && (
                    <span className="text-muted-foreground">
                      {' '}
                      <MaskMoney>
                        {t('of', { amount: formatMoney(goal.targetAmount, goal.currency) })}
                      </MaskMoney>
                    </span>
                  )}
                </p>
                {step && (
                  <p className="text-muted-foreground truncate text-xs tabular-nums">
                    <MaskMoney>{step}</MaskMoney>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </TileBox>
  );
}
