import {
  type Category,
  firstMatchingRule,
  firstMatchingSavingsRule,
  type ImportCheckInput,
  type ImportCheckResult,
  type ImportInput,
  type Rule,
  type SavingsGoal,
  type SavingsRule,
  type StatementRow,
  type StatementSource,
  type TransactionVisibility,
} from '@splinance/shared';
import { formatDayHeading } from '@/features/transactions/dates';
import { i18n } from '@/i18n';

/** "Needs a look" first, then what is ready, then what cannot be imported. */
export type ReviewGroup = 'needs-look' | 'ready' | 'left-out';

/** Why a row is in its group, as data: the text follows the UI language (`reasonText`). */
export type ReviewReason =
  | { code: 'pending' }
  | { code: 'currency'; currency: string }
  | { code: 'imported' }
  | { code: 'duplicate'; description: string; occurredOn: string }
  | { code: 'duplicate-savings'; goal: string; occurredOn: string }
  | { code: 'deleted' }
  | { code: 'own-transfer' }
  | { code: 'cash' };

/** "Already imported", "Maybe already added: "Groceries", Today, Sat 10 Oct". */
export function reasonText(reason: ReviewReason): string {
  switch (reason.code) {
    case 'currency':
      return i18n.t('imports:reasons.currency', { currency: reason.currency });
    case 'duplicate':
      return i18n.t('imports:reasons.duplicate', {
        description: reason.description,
        day: formatDayHeading(reason.occurredOn),
      });
    case 'duplicate-savings':
      return i18n.t('imports:reasons.duplicate-savings', {
        goal: reason.goal,
        day: formatDayHeading(reason.occurredOn),
      });
    default:
      return i18n.t(`imports:reasons.${reason.code}`);
  }
}

/**
 * Where a picked row goes: a transaction, or the viewer's money moved to or from a savings
 * goal (a pocket), which becomes a savings entry and never counts as spending.
 */
export type Destination = 'transaction' | 'savings';

/** A bank row on the review screen, with what the person chose for it. */
export interface ReviewRow {
  /** Unique on the screen: the fingerprint, or the line for rows without one. */
  key: string;
  row: StatementRow;
  group: ReviewGroup;
  /** Why it is in its group; none for ordinary ready rows. */
  reason: ReviewReason | undefined;
  included: boolean;
  description: string;
  /** '' for no category. */
  categoryId: string;
  visibility: TransactionVisibility;
  /** The rule that filled in the category (and maybe shared), if one matched. */
  rule: Pick<Rule, 'id' | 'pattern' | 'categoryId'> | null;
  destination: Destination;
  /** The goal of a savings row; '' until one is picked. */
  goalId: string;
  /** The viewer's savings rule that sent the row to a goal, if one matched. */
  savingsRule: Pick<SavingsRule, 'id' | 'pattern' | 'goalId'> | null;
}

/** Rows worth asking the API about: identifiable and importable at all. */
export function rowsToCheck(rows: StatementRow[], currency: string): ImportCheckInput['rows'] {
  return rows
    .filter((row) => importable(row, currency))
    .map((row) => ({
      fingerprint: row.fingerprint ?? '',
      occurredOn: row.occurredOn,
      kind: row.kind,
      amount: row.amount,
    }));
}

const importable = (row: StatementRow, currency: string) =>
  row.fingerprint !== null && !row.flags.includes('pending') && row.currency === currency;

function classify(
  row: StatementRow,
  result: ImportCheckResult | undefined,
  currency: string,
): Pick<ReviewRow, 'group' | 'reason'> {
  if (row.flags.includes('pending') || row.fingerprint === null) {
    return { group: 'left-out', reason: { code: 'pending' } };
  }
  if (row.currency !== currency) {
    return { group: 'left-out', reason: { code: 'currency', currency: row.currency } };
  }
  if (result?.status === 'imported') return { group: 'left-out', reason: { code: 'imported' } };

  if (result?.status === 'possible-duplicate' && result.match) {
    const { description, occurredOn, goalId } = result.match;
    return {
      group: 'needs-look',
      reason: goalId
        ? { code: 'duplicate-savings', goal: description, occurredOn }
        : { code: 'duplicate', description, occurredOn },
    };
  }
  if (result?.status === 'deleted') {
    return { group: 'needs-look', reason: { code: 'deleted' } };
  }
  if (row.flags.includes('own-transfer')) {
    return { group: 'needs-look', reason: { code: 'own-transfer' } };
  }
  if (row.flags.includes('cash-withdrawal')) {
    return { group: 'needs-look', reason: { code: 'cash' } };
  }
  return { group: 'ready', reason: undefined };
}

export interface SavingsContext {
  /** The viewer's savings rules whose goal is open, oldest first. */
  rules: SavingsRule[];
  /** Whether the viewer has an open goal to send rows to. */
  hasGoals: boolean;
}

/**
 * The review screen's rows: ready ones are picked, private and without a category; the
 * ones that need a look are not picked; the rest cannot be. The first matching rule (only
 * pass rules whose category is active) fills in the category, and shared if it says so.
 *
 * Savings: a row the viewer's savings rule matches goes to its goal, picked when it is
 * ready or a transfer between own accounts (the rule says what that transfer is); a
 * possible duplicate keeps its goal but stays unpicked. A transfer between own accounts
 * with no rule starts as "Savings" without a goal, so ticking it asks for one; nothing
 * starts as savings without an open goal.
 */
export function buildReview(
  rows: StatementRow[],
  results: ImportCheckResult[],
  currency: string,
  rules: Rule[] = [],
  savings: SavingsContext = { rules: [], hasGoals: false },
): ReviewRow[] {
  const byFingerprint = new Map(results.map((result) => [result.fingerprint, result]));
  return rows.map((row) => {
    const { group, reason } = classify(
      row,
      row.fingerprint ? byFingerprint.get(row.fingerprint) : undefined,
      currency,
    );
    const rule = group === 'left-out' ? undefined : firstMatchingRule(rules, row);
    const savingsRule =
      group === 'left-out' || !savings.hasGoals
        ? undefined
        : firstMatchingSavingsRule(savings.rules, row);
    const ownTransfer = reason?.code === 'own-transfer';
    const toSavings = savingsRule !== undefined || (ownTransfer && savings.hasGoals);
    return {
      key: row.fingerprint ?? `line:${String(row.line)}`,
      row,
      group,
      reason,
      included: group === 'ready' || (savingsRule !== undefined && ownTransfer),
      description: row.description,
      categoryId: rule?.categoryId ?? '',
      visibility: rule?.markShared ? 'shared' : 'private',
      rule: rule ? { id: rule.id, pattern: rule.pattern, categoryId: rule.categoryId } : null,
      destination: toSavings ? 'savings' : 'transaction',
      goalId: savingsRule?.goalId ?? '',
      savingsRule: savingsRule
        ? { id: savingsRule.id, pattern: savingsRule.pattern, goalId: savingsRule.goalId }
        : null,
    };
  });
}

/** Rows that will be sent: picked and importable. */
export const pickedRows = (rows: ReviewRow[]) =>
  rows.filter((review) => review.included && review.group !== 'left-out');

/**
 * Changes picked transaction rows; `onlyKind` limits it to rows a category of that kind
 * fits. Savings rows keep their goal: the bulk actions are about transactions.
 */
export function updatePicked(
  rows: ReviewRow[],
  patch: Partial<Pick<ReviewRow, 'categoryId' | 'visibility'>>,
  onlyKind?: Category['kind'],
): ReviewRow[] {
  return rows.map((review) =>
    review.included &&
    review.destination === 'transaction' &&
    (!onlyKind || review.row.kind === onlyKind)
      ? { ...review, ...patch }
      : review,
  );
}

/** Signed, as a savings entry: money that left the account went into the goal. */
const entryAmount = (review: ReviewRow) =>
  review.row.kind === 'expense' ? review.row.amount : -review.row.amount;

/** What stops the import before the API would: savings rows without a goal, or short goals. */
export interface SavingsProblems {
  /** Keys of picked savings rows that have no goal yet. */
  missingGoal: Set<string>;
  /** Goals the picked rows would take below zero, with what they hold now. */
  short: Map<string, { goal: SavingsGoal; balance: number }>;
}

/**
 * Checks the picked savings rows against the goals: each needs a goal, and a goal must hold
 * what is taken out of it once the money put in by the same file is counted (the API
 * applies deposits first too).
 */
export function savingsProblems(rows: ReviewRow[], goals: SavingsGoal[]): SavingsProblems {
  const missingGoal = new Set<string>();
  const net = new Map<string, number>();
  for (const review of pickedRows(rows)) {
    if (review.destination !== 'savings') continue;
    if (!review.goalId) {
      missingGoal.add(review.key);
      continue;
    }
    net.set(review.goalId, (net.get(review.goalId) ?? 0) + entryAmount(review));
  }
  const short = new Map<string, { goal: SavingsGoal; balance: number }>();
  for (const [goalId, amount] of net) {
    const goal = goals.find((candidate) => candidate.id === goalId);
    if (goal && goal.balance + amount < 0) short.set(goalId, { goal, balance: goal.balance });
  }
  return { missingGoal, short };
}

/**
 * The import request for the picked rows. Shared ones are paid (or received) by the viewer
 * and split equally between the household's members, like a new transaction. Savings rows
 * become entries of the viewer in their goal, with the description as the note.
 */
export function toImportInput(
  rows: ReviewRow[],
  {
    source,
    fileName,
    viewerId,
    memberIds,
  }: { source: StatementSource; fileName: string; viewerId: string; memberIds: string[] },
): ImportInput {
  return {
    source,
    fileName: fileName.slice(0, 200) || null,
    rows: pickedRows(rows).map(
      ({ row, description, categoryId, visibility, destination, goalId }) => {
        const text = description.trim() || row.description;
        if (destination === 'savings') {
          return {
            fingerprint: row.fingerprint ?? '',
            savings: {
              goalId,
              kind: row.kind,
              amount: row.amount,
              entryOn: row.occurredOn,
              note: text,
            },
          };
        }
        const common = {
          kind: row.kind,
          amount: row.amount,
          occurredOn: row.occurredOn,
          description: text,
          categoryId: categoryId || null,
        };
        return {
          fingerprint: row.fingerprint ?? '',
          counterparty: row.counterparty?.slice(0, 120) ?? null,
          transaction:
            visibility === 'shared'
              ? {
                  ...common,
                  visibility: 'shared' as const,
                  paidBy: viewerId,
                  split: { method: 'equal' as const, userIds: memberIds },
                }
              : { ...common, visibility: 'private' as const },
        };
      },
    ),
  };
}
