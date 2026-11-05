import {
  type Currency,
  type SettlementInput,
  settlementInputSchema,
  type TransactionPerson,
} from '@splinance/shared';
import { z } from 'zod';
import { i18n } from '@/i18n';
import { today } from '@/features/transactions/dates';
import {
  amountProblemMessage,
  formatAmountInput,
  formatMoney,
  readAmount,
} from '@/features/transactions/money';

/** Who paid whom, seen from the viewer. */
export type PaymentDirection = 'they-paid' | 'you-paid';

/** Form state: text as typed; `toSettlementInput` turns it into the API contract. */
export interface SettlementFormValues {
  counterpartId: string;
  direction: PaymentDirection;
  amount: string;
  settledOn: string;
  note: string;
}

/**
 * Prefilled from the balance with that person: whoever owes pays the whole debt. Square
 * means nothing to suggest, so the viewer pays and types the amount.
 */
export function settlementDefaults(
  counterpartId: string,
  balance: number,
  currency: Currency,
): Pick<SettlementFormValues, 'counterpartId' | 'direction' | 'amount'> {
  return {
    counterpartId,
    direction: balance > 0 ? 'they-paid' : 'you-paid',
    amount: balance === 0 ? '' : formatAmountInput(Math.abs(balance), currency),
  };
}

export function newSettlementValues(
  counterpartId: string,
  balance: number,
  currency: Currency,
): SettlementFormValues {
  return {
    ...settlementDefaults(counterpartId, balance, currency),
    settledOn: today(),
    note: '',
  };
}

interface Issue {
  path: keyof SettlementFormValues;
  message: string;
}

function toSettlementInput(
  values: SettlementFormValues,
  viewerId: string,
  currency: Currency,
): { input: unknown; issues: Issue[] } {
  const issues: Issue[] = [];
  const amount = readAmount(values.amount, currency);
  if (amount.problem) {
    issues.push({ path: 'amount', message: amountProblemMessage(amount.problem, currency) });
  }
  const theyPaid = values.direction === 'they-paid';
  return {
    input: {
      fromUserId: theyPaid ? values.counterpartId : viewerId,
      toUserId: theyPaid ? viewerId : values.counterpartId,
      amount: amount.minor,
      settledOn: values.settledOn,
      note: values.note.trim() === '' ? null : values.note,
    },
    issues,
  };
}

const formPaths: Partial<Record<string, keyof SettlementFormValues>> = {
  amount: 'amount',
  settledOn: 'settledOn',
  note: 'note',
  fromUserId: 'counterpartId',
  toUserId: 'counterpartId',
};

/** Validator for the form: the shared input schema, with its issues mapped to fields. */
export function settlementFormSchema(viewerId: string, currency: Currency) {
  return z.custom<SettlementFormValues>().superRefine((values, ctx) => {
    const { input, issues } = toSettlementInput(values, viewerId, currency);
    for (const issue of issues)
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });

    const result = settlementInputSchema.safeParse(input);
    if (result.success) return;
    const taken = new Set<string>(issues.map((issue) => issue.path));
    for (const issue of result.error.issues) {
      const path = formPaths[String(issue.path[0])];
      if (!path || taken.has(path)) continue;
      taken.add(path);
      ctx.addIssue({ code: 'custom', path: [path], message: issue.message });
    }
  });
}

/** For submit, after the validator passed. */
export function parseSettlementInput(
  values: SettlementFormValues,
  viewerId: string,
  currency: Currency,
): SettlementInput {
  return settlementInputSchema.parse(toSettlementInput(values, viewerId, currency).input);
}

/**
 * What the balance with this person will be after the payment, in words: "Ben still owes
 * you 2000 Ft", "You're all square after this", or a heads-up when it flips. Undefined
 * while the amount cannot be read.
 */
export function remainingHint(
  balance: number,
  values: Pick<SettlementFormValues, 'direction' | 'amount'>,
  person: TransactionPerson,
  currency: Currency,
): { text: string; square: boolean } | undefined {
  const paid = readAmount(values.amount, currency).minor;
  if (paid === undefined) return undefined;
  // Positive: they owe the viewer. Their payment lowers it, the viewer's raises it.
  const after = values.direction === 'they-paid' ? balance - paid : balance + paid;
  const name = person.displayName;
  if (after === 0) return { text: i18n.t('balances:after.square'), square: true };

  const flips = balance !== 0 && Math.sign(after) !== Math.sign(balance);
  const amount = formatMoney(Math.abs(after), currency);
  const state =
    after > 0
      ? i18n.t('balances:after.owesYou', { name, amount })
      : i18n.t('balances:after.youOwe', { name, amount });
  // The overpaid part is exactly the new debt the other way round.
  if (flips) {
    return { text: i18n.t('balances:after.overpaid', { amount, state }), square: false };
  }
  // "Still" only while the same debt shrinks; a payment the other way makes it grow.
  if (Math.abs(after) >= Math.abs(balance)) {
    return { text: i18n.t('balances:after.then', { state }), square: false };
  }
  return {
    text:
      after > 0
        ? i18n.t('balances:after.stillOwesYou', { name, amount })
        : i18n.t('balances:after.stillYouOwe', { name, amount }),
    square: false,
  };
}
