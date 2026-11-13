import type { SavingsGoal } from '@splinance/shared';

/** Steps on the way to a target, in percent. The last one is the goal itself. */
export const MILESTONES = [25, 50, 75, 100] as const;

type GoalMoney = Pick<SavingsGoal, 'balance' | 'targetAmount'>;

export interface GoalProgress {
  /** Whole percent of the target, rounded down and capped at 100; null without a target. */
  percent: number | null;
  reached: boolean;
  /** What is missing from the target; 0 without one or once reached. */
  toGo: number;
  /** The milestones the balance has passed. Taking money out can lose one again. */
  passed: number[];
  /** The first milestone still ahead, and what is missing to it. */
  next: { percent: number; toGo: number } | null;
}

/** A milestone in money: rounded up, so it is never shown as passed a forint early. */
const milestoneAmount = (target: number, percent: number) => Math.ceil((target * percent) / 100);

/** Where a goal stands against its target. Derived on every render: nothing is stored. */
export function goalProgress({ balance, targetAmount }: GoalMoney): GoalProgress {
  if (targetAmount === null) {
    return { percent: null, reached: false, toGo: 0, passed: [], next: null };
  }
  const passed = MILESTONES.filter((percent) => balance >= milestoneAmount(targetAmount, percent));
  const ahead = MILESTONES.find((percent) => balance < milestoneAmount(targetAmount, percent));
  return {
    percent: Math.min(100, Math.floor((balance * 100) / targetAmount)),
    reached: balance >= targetAmount,
    toGo: Math.max(0, targetAmount - balance),
    passed,
    next: ahead ? { percent: ahead, toGo: milestoneAmount(targetAmount, ahead) - balance } : null,
  };
}

export type GoalPace =
  /** Putting in `perMonth` in each of the `months` left reaches the target by its date. */
  | { kind: 'monthly'; perMonth: number; months: number }
  /** The date has passed and the target is not reached. */
  | { kind: 'overdue' };

/**
 * What it takes to get there in time: the rest spread over the whole months left (at least
 * one), rounded up so the last month is never short. Null without a target and a date, or
 * once reached. The app does not judge the past ("on track"): it has no plan to compare to.
 */
export function goalPace(
  goal: GoalMoney & Pick<SavingsGoal, 'targetDate'>,
  today: string,
): GoalPace | null {
  const { toGo } = goalProgress(goal);
  if (goal.targetDate === null || toGo === 0) return null;
  if (goal.targetDate < today) return { kind: 'overdue' };
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const [toYear, toMonth, toDay] = goal.targetDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const whole = (toYear - year) * 12 + (toMonth - month) - (toDay < day ? 1 : 0);
  const months = Math.max(1, whole);
  return { kind: 'monthly', perMonth: Math.ceil(toGo / months), months };
}

export interface ArrangedGoals {
  /** Shown large: the viewer's pins, or one picked for them while they have none. */
  featured: SavingsGoal[];
  /** The other open goals. */
  rest: SavingsGoal[];
  closed: SavingsGoal[];
  /** `featured` was picked, not pinned. */
  auto: boolean;
}

/**
 * The page's order. Pinned goals lead. Without any pin one open goal is featured so the
 * page never opens flat: the one with the nearest date, else the one closest to its target
 * (only goals that have a target and have not reached it).
 */
export function arrangeGoals(goals: readonly SavingsGoal[]): ArrangedGoals {
  const open = goals.filter((goal) => goal.archivedAt === null);
  const closed = goals.filter((goal) => goal.archivedAt !== null);
  const pinned = open.filter((goal) => goal.pinned);
  if (pinned.length > 0) {
    return { featured: pinned, rest: open.filter((goal) => !goal.pinned), closed, auto: false };
  }

  const [pick] = open
    .filter((goal) => goal.targetAmount !== null && !goalProgress(goal).reached)
    .sort((a, b) => {
      if (a.targetDate !== b.targetDate) {
        if (a.targetDate === null) return 1;
        if (b.targetDate === null) return -1;
        return a.targetDate < b.targetDate ? -1 : 1;
      }
      return (goalProgress(b).percent ?? 0) - (goalProgress(a).percent ?? 0);
    });
  return {
    featured: pick ? [pick] : [],
    rest: open.filter((goal) => goal !== pick),
    closed,
    auto: pick !== undefined,
  };
}

/** Fills for the other members' parts of a bar; the viewer's own is always `bg-positive`. */
const OTHER_FILLS = ['bg-brand-orange', 'bg-brand-sky', 'bg-brand-pink', 'bg-brand-mustard'];

/**
 * One fill per member across the whole page, so a person has the same color in every goal.
 * By user id, not by amount: the colors stay put when the amounts change.
 */
export function memberFills(goals: readonly SavingsGoal[], viewerId: string): Map<string, string> {
  const others = [
    ...new Set(goals.flatMap((goal) => goal.contributions.map((part) => part.userId))),
  ]
    .filter((userId) => userId !== viewerId)
    .sort();
  const fills = new Map<string, string>([[viewerId, 'bg-positive']]);
  others.forEach((userId, index) => {
    fills.set(userId, OTHER_FILLS[index % OTHER_FILLS.length] ?? 'bg-positive');
  });
  return fills;
}

export interface BarSegment {
  userId: string;
  displayName: string;
  /** What the member has in the goal. */
  amount: number;
  /** Their part of the whole bar, 0 to 1. */
  fraction: number;
}

/**
 * The filled part of a goal's bar, split by who put the money in. The filled part is the
 * balance against the target (the whole bar without a target); members share it by what
 * they have in the goal. Someone who took out more than they put in has no slice.
 */
export function barSegments(goal: SavingsGoal): BarSegment[] {
  const filled =
    goal.targetAmount === null
      ? goal.balance > 0
        ? 1
        : 0
      : Math.min(1, goal.balance / goal.targetAmount);
  const parts = goal.contributions.filter((part) => part.amount > 0);
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (total === 0) return [];
  return parts.map((part) => ({ ...part, fraction: (filled * part.amount) / total }));
}

/** Totals for the strip above the goals: open goals only. */
export function savingsTotals(goals: readonly SavingsGoal[], viewerId: string) {
  const open = goals.filter((goal) => goal.archivedAt === null);
  return {
    saved: open.reduce((sum, goal) => sum + goal.balance, 0),
    yours: open.reduce(
      (sum, goal) =>
        sum + (goal.contributions.find((part) => part.userId === viewerId)?.amount ?? 0),
      0,
    ),
  };
}

/** The overview's savings tile has room for this many rings. */
export const MAX_RINGS = 2;

/**
 * The goals the overview shows: the ones the savings page leads with (the viewer's pins,
 * else the goal picked for them), else any open goal; at most `MAX_RINGS`.
 */
export function overviewGoals(goals: readonly SavingsGoal[]): SavingsGoal[] {
  const { featured, rest } = arrangeGoals(goals);
  return (featured.length > 0 ? featured : rest).slice(0, MAX_RINGS);
}

/** How full a goal's ring is: its balance against the target, 0 to 1; null without a target. */
export function ringFraction({ balance, targetAmount }: GoalMoney): number | null {
  if (targetAmount === null) return null;
  return Math.min(1, Math.max(0, balance / targetAmount));
}
