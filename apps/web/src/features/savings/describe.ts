import type { SavingsGoal } from '@splinance/shared';
import { formatDateWith, fromIsoDate } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { i18n } from '@/i18n';
import { goalPace, goalProgress } from './view';

/** "1 Jul 2027" / "2027. júl. 1.": always with the year, a target is often next year. */
export const formatGoalDate = (value: string) =>
  formatDateWith(fromIsoDate(value), { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Where the goal stands in words: "30 000 Ft to 75%", "180 000 Ft to go" before the last
 * step, "Goal reached". Null without a target.
 */
export function stepText(goal: SavingsGoal): string | null {
  const { reached, next } = goalProgress(goal);
  if (reached) return i18n.t('savings:reached');
  if (!next) return null;
  const amount = formatMoney(next.toGo, goal.currency);
  return next.percent === 100
    ? i18n.t('savings:lastMilestone', { amount })
    : i18n.t('savings:nextMilestone', { amount, percent: next.percent });
}

/**
 * What it takes to arrive in time: "25 800 Ft a month gets you there by 1 Jul 2027".
 * `overdue` once the date has passed. Null without a date or a target, or once reached.
 */
export function paceText(
  goal: SavingsGoal,
  today: string,
): { text: string; overdue: boolean } | null {
  const pace = goalPace(goal, today);
  if (pace === null || goal.targetDate === null) return null;
  if (pace.kind === 'overdue') return { text: i18n.t('savings:pace.overdue'), overdue: true };
  return {
    text: i18n.t(pace.months === 1 ? 'savings:pace.lastMonth' : 'savings:pace.monthly', {
      amount: formatMoney(pace.perMonth, goal.currency),
      date: formatGoalDate(goal.targetDate),
    }),
    overdue: false,
  };
}
