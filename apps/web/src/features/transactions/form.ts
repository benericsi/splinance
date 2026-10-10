import {
  allocate,
  type Currency,
  type HouseholdMember,
  PERCENT_SCALE,
  type SplitMethod,
  type Transaction,
  type TransactionInput,
  transactionInputSchema,
  type TransactionKind,
  type TransactionVisibility,
} from '@splinance/shared';
import { z } from 'zod';
import { today } from './dates';
import { formatAmountInput, formatPercentInput, parseAmount, parsePercent } from './money';

/** One person in the split editor. Text fields hold what was typed. */
export interface ShareRow {
  userId: string;
  displayName: string;
  /** Not an active member any more (still on this transaction, so still editable). */
  former: boolean;
  included: boolean;
  percent: string;
  amount: string;
}

/** Form state: strings as typed; `toTransactionInput` turns it into the API contract. */
export interface TransactionFormValues {
  kind: TransactionKind;
  amount: string;
  description: string;
  occurredOn: string;
  /** '' for "no category". */
  categoryId: string;
  visibility: TransactionVisibility;
  paidBy: string;
  splitMethod: SplitMethod;
  shares: ShareRow[];
}

const memberRow = (
  member: Pick<HouseholdMember, 'userId' | 'displayName'>,
  former = false,
): ShareRow => ({
  userId: member.userId,
  displayName: member.displayName,
  former,
  included: true,
  percent: '',
  amount: '',
});

/** A new transaction: an expense paid by the viewer, split equally between all members. */
export function newTransactionValues(
  members: Pick<HouseholdMember, 'userId' | 'displayName'>[],
  viewerId: string,
): TransactionFormValues {
  return {
    kind: 'expense',
    amount: '',
    description: '',
    occurredOn: today(),
    categoryId: '',
    visibility: 'shared',
    paidBy: viewerId,
    splitMethod: 'equal',
    shares: members.map((member) => memberRow(member)),
  };
}

/** An existing transaction. People who left but are on it stay as rows. */
export function editTransactionValues(
  transaction: Transaction,
  members: Pick<HouseholdMember, 'userId' | 'displayName'>[],
): TransactionFormValues {
  const rows = members.map((member) => memberRow(member));
  const known = new Set(rows.map((row) => row.userId));
  for (const person of [transaction.paidBy, ...(transaction.split?.shares ?? [])]) {
    if (!known.has(person.userId)) {
      rows.push(memberRow(person, true));
      known.add(person.userId);
    }
  }

  const shareOf = new Map(transaction.split?.shares.map((share) => [share.userId, share]));
  return {
    kind: transaction.kind,
    amount: formatAmountInput(transaction.amount, transaction.currency),
    description: transaction.description,
    occurredOn: transaction.occurredOn,
    categoryId: transaction.categoryId ?? '',
    visibility: transaction.visibility,
    paidBy: transaction.paidBy.userId,
    splitMethod: transaction.split?.method ?? 'equal',
    shares: rows.map((row) => {
      const share = shareOf.get(row.userId);
      return {
        ...row,
        // A private transaction has no split; switching it to shared starts from "everyone".
        included: transaction.split ? share !== undefined : true,
        percent: share?.basisPoints ? formatPercentInput(share.basisPoints) : '',
        amount:
          share && transaction.split?.method === 'fixed'
            ? formatAmountInput(share.amount, transaction.currency)
            : '',
      };
    }),
  };
}

/**
 * Prefills the new method's inputs when they are empty: an even percentage split, or the
 * amount divided evenly. Starting from sensible numbers beats an empty column.
 */
export function prefillShares(
  values: TransactionFormValues,
  method: SplitMethod,
  currency: Currency,
) {
  const included = values.shares.filter((row) => row.included);
  if (included.length === 0) return values.shares;

  if (method === 'percentage' && included.every((row) => row.percent === '')) {
    const parts = allocate(
      PERCENT_SCALE,
      included.map(() => 1),
    );
    return withIncluded(values.shares, (row, i) => ({
      ...row,
      percent: formatPercentInput(parts[i] ?? 0),
    }));
  }
  const total = parseAmount(values.amount, currency);
  if (method === 'fixed' && total !== undefined && included.every((row) => row.amount === '')) {
    const parts = allocate(
      total,
      included.map(() => 1),
    );
    return withIncluded(values.shares, (row, i) => ({
      ...row,
      amount: formatAmountInput(parts[i] ?? 0, currency),
    }));
  }
  return values.shares;
}

function withIncluded(rows: ShareRow[], update: (row: ShareRow, index: number) => ShareRow) {
  let index = 0;
  return rows.map((row) => (row.included ? update(row, index++) : row));
}

export interface FormIssue {
  path: keyof TransactionFormValues;
  message: string;
}

/**
 * Turns form values into the shared input. Text that cannot be read (an amount, a
 * percentage) is reported here; everything else is left to `transactionInputSchema`, the
 * same rules the API applies.
 */
export function toTransactionInput(
  values: TransactionFormValues,
  currency: Currency,
): { input: unknown; issues: FormIssue[] } {
  const issues: FormIssue[] = [];
  const amount = parseAmount(values.amount, currency);
  if (amount === undefined) {
    issues.push({ path: 'amount', message: 'Enter an amount, like 12 500' });
  }

  const base = {
    kind: values.kind,
    amount: amount ?? 0,
    occurredOn: values.occurredOn,
    description: values.description,
    categoryId: values.categoryId || null,
  };
  if (values.visibility === 'private') return { input: { ...base, visibility: 'private' }, issues };

  const included = values.shares.filter((row) => row.included);
  let split: unknown;
  if (values.splitMethod === 'equal') {
    split = { method: 'equal', userIds: included.map((row) => row.userId) };
  } else if (values.splitMethod === 'percentage') {
    const shares = included.map((row) => ({
      userId: row.userId,
      basisPoints: parsePercent(row.percent),
    }));
    if (shares.some((share) => share.basisPoints === undefined)) {
      issues.push({ path: 'shares', message: 'Enter a percentage for everyone in the split' });
    }
    split = { method: 'percentage', shares };
  } else {
    const shares = included.map((row) => ({
      userId: row.userId,
      amount: parseAmount(row.amount, currency),
    }));
    if (shares.some((share) => share.amount === undefined)) {
      issues.push({ path: 'shares', message: 'Enter an amount for everyone in the split' });
    }
    split = { method: 'fixed', shares };
  }
  return { input: { ...base, visibility: 'shared', paidBy: values.paidBy, split }, issues };
}

/** Where a shared-schema issue shows up in the form. */
function formPath(path: readonly PropertyKey[]): keyof TransactionFormValues | undefined {
  const [first] = path;
  if (first === 'split') return 'shares';
  if (
    first === 'amount' ||
    first === 'description' ||
    first === 'occurredOn' ||
    first === 'categoryId' ||
    first === 'paidBy'
  ) {
    return first;
  }
  return undefined;
}

/** The form's validator: reading errors first, then the shared rules, mapped to fields. */
export function transactionFormSchema(currency: Currency) {
  return z.custom<TransactionFormValues>().superRefine((values, ctx) => {
    const { input, issues } = toTransactionInput(values, currency);
    for (const issue of issues)
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });

    const result = transactionInputSchema.safeParse(input);
    if (result.success) return;
    const taken = new Set(issues.map((issue) => issue.path));
    for (const issue of result.error.issues) {
      const path = formPath(issue.path);
      // One message per field; the reading error above is the more helpful one. A split
      // cannot add up to an amount that could not be read, so say nothing about it then.
      if (!path || taken.has(path) || (path === 'shares' && taken.has('amount'))) continue;
      taken.add(path);
      ctx.addIssue({ code: 'custom', path: [path], message: issue.message });
    }
  });
}

/** For submit, after the validator passed. */
export function parseTransactionInput(
  values: TransactionFormValues,
  currency: Currency,
): TransactionInput {
  return transactionInputSchema.parse(toTransactionInput(values, currency).input);
}
