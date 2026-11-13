import {
  type Currency,
  type SavingsEntryInput,
  savingsEntryInputSchema,
  type SavingsGoal,
  type SavingsGoalInput,
  savingsGoalInputSchema,
  type TransactionVisibility,
} from '@splinance/shared';
import { z } from 'zod';
import { today } from '@/features/transactions/dates';
import {
  amountProblemMessage,
  formatAmountInput,
  formatMoney,
  readAmount,
} from '@/features/transactions/money';
import { i18n } from '@/i18n';

/** Goal form state: text as typed. An empty target or date means none. */
export interface GoalFormValues {
  name: string;
  target: string;
  targetDate: string;
  visibility: TransactionVisibility;
}

export function goalFormValues(
  goal: SavingsGoal | undefined,
  currency: Currency,
  visibility: TransactionVisibility,
): GoalFormValues {
  return {
    name: goal?.name ?? '',
    target: goal?.targetAmount ? formatAmountInput(goal.targetAmount, currency) : '',
    targetDate: goal?.targetDate ?? '',
    visibility: goal?.visibility ?? visibility,
  };
}

interface Issue<Path extends string> {
  path: Path;
  message: string;
}

function toGoalInput(
  values: GoalFormValues,
  currency: Currency,
): { input: unknown; issues: Issue<keyof GoalFormValues>[] } {
  const issues: Issue<keyof GoalFormValues>[] = [];
  const target = readAmount(values.target, currency);
  // Empty is a choice here (a pot without a target), anything else unreadable is a mistake.
  if (target.problem && target.problem !== 'empty') {
    issues.push({ path: 'target', message: amountProblemMessage(target.problem, currency) });
  }
  return {
    input: {
      name: values.name,
      targetAmount: target.minor ?? null,
      targetDate: values.targetDate === '' ? null : values.targetDate,
      visibility: values.visibility,
    },
    issues,
  };
}

const goalPaths: Partial<Record<string, keyof GoalFormValues>> = {
  name: 'name',
  targetAmount: 'target',
  targetDate: 'targetDate',
  visibility: 'visibility',
};

/** Validator for the goal form: the shared input schema, with its issues mapped to fields. */
export function goalFormSchema(currency: Currency) {
  return z.custom<GoalFormValues>().superRefine((values, ctx) => {
    const { input, issues } = toGoalInput(values, currency);
    for (const issue of issues) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
    const result = savingsGoalInputSchema.safeParse(input);
    if (result.success) return;
    const taken = new Set<string>(issues.map((issue) => issue.path));
    for (const issue of result.error.issues) {
      const path = goalPaths[String(issue.path[0])];
      if (!path || taken.has(path)) continue;
      taken.add(path);
      ctx.addIssue({ code: 'custom', path: [path], message: issue.message });
    }
  });
}

/** For submit, after the validator passed. */
export function parseGoalInput(values: GoalFormValues, currency: Currency): SavingsGoalInput {
  return savingsGoalInputSchema.parse(toGoalInput(values, currency).input);
}

/** Money goes in or comes out; the API takes one signed amount. */
export type EntryDirection = 'in' | 'out';

export interface EntryFormValues {
  direction: EntryDirection;
  amount: string;
  entryOn: string;
  note: string;
}

export const newEntryValues = (): EntryFormValues => ({
  direction: 'in',
  amount: '',
  entryOn: today(),
  note: '',
});

function toEntryInput(
  values: EntryFormValues,
  balance: number,
  currency: Currency,
): { input: unknown; issues: Issue<keyof EntryFormValues>[] } {
  const issues: Issue<keyof EntryFormValues>[] = [];
  const amount = readAmount(values.amount, currency);
  if (amount.problem) {
    issues.push({ path: 'amount', message: amountProblemMessage(amount.problem, currency) });
  } else if (values.direction === 'out' && amount.minor > balance) {
    // The API refuses it too (409); saying it here saves the round trip.
    issues.push({
      path: 'amount',
      message: i18n.t('savings:entry.tooMuch', { amount: formatMoney(balance, currency) }),
    });
  }
  return {
    input: {
      amount:
        amount.minor === undefined
          ? undefined
          : values.direction === 'out'
            ? -amount.minor
            : amount.minor,
      entryOn: values.entryOn,
      note: values.note.trim() === '' ? null : values.note,
    },
    issues,
  };
}

/** Validator for the entry form; `balance` is what the goal holds now. */
export function entryFormSchema(balance: number, currency: Currency) {
  return z.custom<EntryFormValues>().superRefine((values, ctx) => {
    const { input, issues } = toEntryInput(values, balance, currency);
    for (const issue of issues) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
    const result = savingsEntryInputSchema.safeParse(input);
    if (result.success) return;
    const taken = new Set<string>(issues.map((issue) => issue.path));
    for (const issue of result.error.issues) {
      const path = String(issue.path[0]);
      if ((path !== 'amount' && path !== 'entryOn' && path !== 'note') || taken.has(path)) continue;
      taken.add(path);
      ctx.addIssue({ code: 'custom', path: [path], message: issue.message });
    }
  });
}

/** For submit, after the validator passed. */
export function parseEntryInput(
  values: EntryFormValues,
  balance: number,
  currency: Currency,
): SavingsEntryInput {
  return savingsEntryInputSchema.parse(toEntryInput(values, balance, currency).input);
}
