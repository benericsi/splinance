import { z } from 'zod';
import { currencySchema } from '../households';
import { amountMinorSchema } from '../money';
import { matchKey } from '../rules';
import { occurredOnSchema, transactionKindSchema } from '../transactions';
import { msg } from '../i18n/validation';

export const RECURRING_CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export const recurringCadenceSchema = z.enum(RECURRING_CADENCES);
export type RecurringCadence = z.infer<typeof recurringCadenceSchema>;

/** `dismissed` remembers "Not recurring" for a suggestion: only its pattern matters then. */
export const RECURRING_STATUSES = ['active', 'dismissed'] as const;
export const recurringStatusSchema = z.enum(RECURRING_STATUSES);
export type RecurringStatus = z.infer<typeof recurringStatusSchema>;

/** Added by hand (or "Make recurring" on a transaction), or a confirmed suggestion. */
export const RECURRING_SOURCES = ['manual', 'detected'] as const;
export const recurringSourceSchema = z.enum(RECURRING_SOURCES);
export type RecurringSource = z.infer<typeof recurringSourceSchema>;

/**
 * Shared: a household series, matched against shared transactions only, any member edits
 * it. Private: the caller's own, matched against everything they can see, only they see it.
 */
export const RECURRING_SCOPES = ['shared', 'private'] as const;
export const recurringScopeSchema = z.enum(RECURRING_SCOPES);
export type RecurringScope = z.infer<typeof recurringScopeSchema>;

export const recurringNameSchema = z
  .string()
  .trim()
  .min(1, msg('name.required'))
  .max(60, msg('text.max', 60));

/** The text a series matches in the bank's counterparty or the description (like a rule). */
export const recurringPatternSchema = z
  .string()
  .trim()
  .min(2, msg('text.min', 2))
  .max(60, msg('text.max', 60))
  .refine(
    (pattern) => matchKey(pattern).replace(/[^\p{L}\p{N}]/gu, '').length >= 2,
    msg('pattern.letters'),
  );

/** A detected series' key as `recurringKey` makes it: already a match key. */
export const recurringKeySchema = z
  .string()
  .min(2)
  .max(60)
  .refine((key) => key === matchKey(key), msg('recurring.invalidKey'));

const seriesFields = z.object({
  name: recurringNameSchema,
  pattern: recurringPatternSchema,
  cadence: recurringCadenceSchema,
  /** The expected amount; payments within 25% of it (60% when it varies) belong to it. */
  amount: amountMinorSchema,
  /** For bills that change a lot (gas, electricity): a wider amount tolerance. */
  amountVaries: z.boolean(),
  /** A payment date: the next one (future) or the last one (past). Sets the rhythm. */
  anchorOn: occurredOnSchema,
  /** The earliest payment the series may claim; null for no limit (its history counts). */
  startsOn: occurredOnSchema.nullable(),
  categoryId: z.uuid().nullable(),
  scope: recurringScopeSchema,
  /** Notify a few days before the next payment. */
  remind: z.boolean(),
});

/**
 * What a series tracks: money going out (a subscription, a bill) or coming in (a salary).
 * Fixed at creation, like the scope. Left out, it is an expense (clients from before income
 * series).
 */
const kindWithDefault = transactionKindSchema.default('expense');

const startsBeforeAnchor = (value: {
  startsOn?: string | null | undefined;
  anchorOn?: string | undefined;
}) => !value.startsOn || !value.anchorOn || value.startsOn <= value.anchorOn;
const STARTS_AFTER_ANCHOR = {
  ...msg('recurring.startsAfterAnchor'),
  path: ['startsOn'],
};

/** Adding a series by hand. */
export const recurringSeriesInputSchema = seriesFields
  .extend({ kind: kindWithDefault })
  .refine(startsBeforeAnchor, STARTS_AFTER_ANCHOR);
export type RecurringSeriesInput = z.infer<typeof recurringSeriesInputSchema>;

/** Editing one: any field except its scope and kind (what it is does not change). */
export const updateRecurringSeriesInputSchema = seriesFields
  .omit({ scope: true })
  .partial()
  .refine(startsBeforeAnchor, STARTS_AFTER_ANCHOR);
export type UpdateRecurringSeriesInput = z.infer<typeof updateRecurringSeriesInputSchema>;

/** "Which payments would this match?", asked while the person types the pattern. */
export const recurringPreviewInputSchema = seriesFields
  .pick({
    pattern: true,
    amount: true,
    amountVaries: true,
    scope: true,
    startsOn: true,
  })
  .extend({ kind: kindWithDefault });
export type RecurringPreviewInput = z.infer<typeof recurringPreviewInputSchema>;

/** Confirming or dismissing a suggestion, addressed by what detection calls it. */
export const recurringSuggestionDecisionSchema = z.object({
  scope: recurringScopeSchema,
  kind: kindWithDefault,
  key: recurringKeySchema,
});
export type RecurringSuggestionDecision = z.infer<typeof recurringSuggestionDecisionSchema>;

const dateSchema = z.iso.date();
const positiveAmount = z.number().int().positive();

/** A transaction found to be one of a series' payments (for an income series: money received). */
export const recurringPaymentSchema = z.object({
  transactionId: z.uuid(),
  occurredOn: dateSchema,
  amount: positiveAmount,
  /** From a bank import (else typed in). */
  imported: z.boolean(),
});
export type RecurringPayment = z.infer<typeof recurringPaymentSchema>;

export const recurringSeriesSchema = seriesFields.extend({
  id: z.uuid(),
  kind: transactionKindSchema,
  source: recurringSourceSchema,
  createdBy: z.uuid(),
  /** The latest payments found, newest first (at most 12). */
  payments: z.array(recurringPaymentSchema).max(12),
  paymentCount: z.number().int().nonnegative(),
  lastPaidOn: dateSchema.nullable(),
  /** The latest payment's amount, or the expected amount before any payment. */
  latestAmount: positiveAmount,
  previousAmount: positiveAmount.nullable(),
  /** The caller's part of the latest payment; null when private or nothing paid yet. */
  share: z.number().int().nonnegative().nullable(),
  monthlyAmount: z.number().int().nonnegative(),
});
export type RecurringSeries = z.infer<typeof recurringSeriesSchema>;

/** Transactions that look recurring and belong to no series yet. */
export const recurringSuggestionSchema = z.object({
  key: recurringKeySchema,
  scope: recurringScopeSchema,
  kind: transactionKindSchema,
  cadence: recurringCadenceSchema,
  amount: positiveAmount,
  previousAmount: positiveAmount.nullable(),
  amountVaries: z.boolean(),
  firstOn: dateSchema,
  lastOn: dateSchema,
  occurrences: z.number().int().positive(),
  /** The latest payment's description, the suggested name. */
  description: z.string(),
  categoryId: z.uuid().nullable(),
  monthlyAmount: z.number().int().nonnegative(),
  transactionIds: z.array(z.uuid()).max(12),
});
export type RecurringSuggestion = z.infer<typeof recurringSuggestionSchema>;

/** A dismissed suggestion, listed under "Hidden" with "Show again". */
export const dismissedRecurringSchema = z.object({
  id: z.uuid(),
  pattern: z.string(),
  scope: recurringScopeSchema,
  kind: transactionKindSchema,
});
export type DismissedRecurring = z.infer<typeof dismissedRecurringSchema>;

export const recurringListSchema = z.object({
  currency: currencySchema,
  series: z.array(recurringSeriesSchema),
  suggestions: z.array(recurringSuggestionSchema),
  dismissed: z.array(dismissedRecurringSchema),
});
export type RecurringList = z.infer<typeof recurringListSchema>;

export const recurringListResponseSchema = z.object({ recurring: recurringListSchema });
export type RecurringListResponse = z.infer<typeof recurringListResponseSchema>;

export const recurringSeriesResponseSchema = z.object({ series: recurringSeriesSchema });
export type RecurringSeriesResponse = z.infer<typeof recurringSeriesResponseSchema>;

export const recurringPreviewResponseSchema = z.object({
  matches: z.number().int().nonnegative(),
  /** The latest few, newest first. */
  recent: z.array(recurringPaymentSchema).max(3),
});
export type RecurringPreviewResponse = z.infer<typeof recurringPreviewResponseSchema>;
