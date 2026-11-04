import {
  type Currency,
  occurredOnSchema,
  type RecurringCadence,
  recurringCadenceSchema,
  recurringKey,
  recurringNameSchema,
  recurringPatternSchema,
  type RecurringScope,
  recurringScopeSchema,
  type RecurringSeries,
  type RecurringSeriesInput,
  type Transaction,
} from '@splinance/shared';
import { z } from 'zod';
import { today } from '@/features/transactions/dates';
import { amountProblemMessage, formatAmountInput, readAmount } from '@/features/transactions/money';

export interface SeriesFormValues {
  name: string;
  pattern: string;
  /** As typed. */
  amount: string;
  cadence: RecurringCadence;
  anchorOn: string;
  /** '' for none. */
  categoryId: string;
  scope: RecurringScope;
  amountVaries: boolean;
  remind: boolean;
}

export function seriesFormSchema(currency: Currency) {
  return z
    .object({
      name: recurringNameSchema,
      pattern: recurringPatternSchema,
      amount: z.string(),
      cadence: recurringCadenceSchema,
      anchorOn: occurredOnSchema,
      categoryId: z.string(),
      scope: recurringScopeSchema,
      amountVaries: z.boolean(),
      remind: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const amount = readAmount(values.amount, currency);
      if (amount.problem) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: amountProblemMessage(amount.problem, currency),
        });
      }
    });
}

export const newSeriesValues = (): SeriesFormValues => ({
  name: '',
  pattern: '',
  amount: '',
  cadence: 'monthly',
  anchorOn: today(),
  categoryId: '',
  scope: 'shared',
  amountVaries: false,
  remind: true,
});

/**
 * "Make recurring" on a transaction: its description, amount, date and category, the bank's
 * name for the merchant as the text to match, and its visibility as the scope.
 */
export const seriesValuesFrom = (
  transaction: Transaction,
  currency: Currency,
): SeriesFormValues => ({
  ...newSeriesValues(),
  name: transaction.description.slice(0, 60),
  pattern: recurringKey(transaction),
  amount: formatAmountInput(transaction.amount, currency),
  anchorOn: transaction.occurredOn,
  categoryId: transaction.categoryId ?? '',
  scope: transaction.visibility === 'private' ? 'private' : 'shared',
});

export const editSeriesValues = (
  series: RecurringSeries,
  currency: Currency,
): SeriesFormValues => ({
  name: series.name,
  pattern: series.pattern,
  amount: formatAmountInput(series.amount, currency),
  cadence: series.cadence,
  anchorOn: series.anchorOn,
  categoryId: series.categoryId ?? '',
  scope: series.scope,
  amountVaries: series.amountVaries,
  remind: series.remind,
});

/** The API body from valid form values (`startsOn` is kept as it was). */
export function parseSeriesInput(
  values: SeriesFormValues,
  currency: Currency,
  startsOn: string | null = null,
): RecurringSeriesInput {
  return {
    name: values.name.trim(),
    pattern: values.pattern.trim(),
    cadence: values.cadence,
    amount: readAmount(values.amount, currency).minor ?? 0,
    amountVaries: values.amountVaries,
    anchorOn: values.anchorOn,
    startsOn,
    categoryId: values.categoryId === '' ? null : values.categoryId,
    scope: values.scope,
    remind: values.remind,
  };
}
