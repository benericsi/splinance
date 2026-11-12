import { z } from 'zod';
import { settlementNoteSchema } from './balances';
import { currencySchema } from './households';
import { msg } from './i18n/validation';
import { amountMinorSchema, MAX_AMOUNT_MINOR } from './money';
import {
  monthSchema,
  occurredOnSchema,
  personSchema,
  transactionVisibilitySchema,
} from './transactions';

export const SAVINGS_GOAL_NAME_MAX = 60;

const goalNameSchema = z
  .string()
  .trim()
  .min(1, msg('name.required'))
  .max(SAVINGS_GOAL_NAME_MAX, msg('name.tooLong', SAVINGS_GOAL_NAME_MAX));

const goalFields = {
  name: goalNameSchema,
  /** Null for an open-ended pot. */
  targetAmount: amountMinorSchema.nullable(),
  targetDate: occurredOnSchema.nullable(),
};

/**
 * A new goal. `visibility` is chosen once: a private goal is only ever readable by the
 * person who made it, and it cannot be shared later (that would publish its history).
 */
export const savingsGoalInputSchema = z.object({
  ...goalFields,
  visibility: transactionVisibilitySchema,
});

export type SavingsGoalInput = z.infer<typeof savingsGoalInputSchema>;

/** An edit replaces the name and the target; the visibility stays. */
export const updateSavingsGoalInputSchema = z.object(goalFields);
export type UpdateSavingsGoalInput = z.infer<typeof updateSavingsGoalInputSchema>;

/**
 * Money put into a goal (positive) or taken out of it (negative), in minor units. The app
 * moves no money: this records what happened at the bank. Entries are never edited; a
 * wrong one is deleted and recorded again.
 */
export const savingsEntryInputSchema = z.object({
  amount: z
    .number()
    .int(msg('amount.whole'))
    .min(-MAX_AMOUNT_MINOR, msg('amount.tooLarge'))
    .max(MAX_AMOUNT_MINOR, msg('amount.tooLarge'))
    .refine((amount) => amount !== 0, msg('amount.positive')),
  entryOn: occurredOnSchema,
  note: settlementNoteSchema,
});

export type SavingsEntryInput = z.infer<typeof savingsEntryInputSchema>;

/** What one member has in a goal: what they put in minus what they took out. */
export const savingsContributionSchema = personSchema.extend({ amount: z.number().int() });
export type SavingsContribution = z.infer<typeof savingsContributionSchema>;

export const savingsGoalSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  targetAmount: z.number().int().positive().nullable(),
  targetDate: z.iso.date().nullable(),
  currency: currencySchema,
  visibility: transactionVisibilitySchema,
  createdBy: personSchema,
  /** Closed goals keep their history and take no new entries. */
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  /** The sum of the goal's entries: derived, never below zero. */
  balance: z.number().int().nonnegative(),
  /** Per member, largest first; members with nothing in the goal are left out. */
  contributions: z.array(savingsContributionSchema),
  createdAt: z.iso.datetime({ offset: true }),
});

export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const savingsGoalResponseSchema = z.object({ goal: savingsGoalSchema });
export type SavingsGoalResponse = z.infer<typeof savingsGoalResponseSchema>;

/** `month` asks for what the viewer set aside in that month. */
export const savingsQuerySchema = z.object({ month: monthSchema.optional() });
export type SavingsQuery = z.infer<typeof savingsQuerySchema>;

/**
 * The goals the viewer can see (shared ones and their own private ones), active first.
 * `setAside` is the viewer's own entries in the month asked for, added up over all of those
 * goals: negative when they took out more than they put in, null without a month.
 */
export const savingsSchema = z.object({
  currency: currencySchema,
  goals: z.array(savingsGoalSchema),
  setAside: z.number().int().nullable(),
});

export type Savings = z.infer<typeof savingsSchema>;

export const savingsResponseSchema = z.object({ savings: savingsSchema });
export type SavingsResponse = z.infer<typeof savingsResponseSchema>;

export const savingsEntrySchema = z.object({
  id: z.uuid(),
  user: personSchema,
  /** Positive: put in. Negative: taken out. */
  amount: z.number().int(),
  entryOn: z.iso.date(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type SavingsEntry = z.infer<typeof savingsEntrySchema>;

/** A write answers with the entry and the goal as it is after it. */
export const savingsEntryResponseSchema = z.object({
  entry: savingsEntrySchema,
  goal: savingsGoalSchema,
});

export type SavingsEntryResponse = z.infer<typeof savingsEntryResponseSchema>;

/** Newest first (by date, then id), paged with a keyset cursor like settlements. */
export const savingsEntryListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SavingsEntryListQuery = z.input<typeof savingsEntryListQuerySchema>;
export type SavingsEntryListFilters = z.output<typeof savingsEntryListQuerySchema>;

export const savingsEntryListResponseSchema = z.object({
  entries: z.array(savingsEntrySchema),
  nextCursor: z.string().nullable(),
});

export type SavingsEntryListResponse = z.infer<typeof savingsEntryListResponseSchema>;
