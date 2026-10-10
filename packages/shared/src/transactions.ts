import { z } from 'zod';
import { categoryKindSchema } from './categories';
import { currencySchema } from './households';
import { amountMinorSchema } from './money';
import { PERCENT_SCALE, SPLIT_METHODS, type SplitProblem, splitProblem } from './splits';

/** Transactions share the category kinds: an expense goes under an expense category. */
export const transactionKindSchema = categoryKindSchema;
export type TransactionKind = z.infer<typeof transactionKindSchema>;

/** Private: only its author sees it, paid by them, never split. Shared: visible to all members. */
export const TRANSACTION_VISIBILITIES = ['shared', 'private'] as const;
export const transactionVisibilitySchema = z.enum(TRANSACTION_VISIBILITIES);
export type TransactionVisibility = z.infer<typeof transactionVisibilitySchema>;

export const splitMethodSchema = z.enum(SPLIT_METHODS);

/** A calendar date (`YYYY-MM-DD`), within a sane range for household bookkeeping. */
export const occurredOnSchema = z.iso
  .date('Enter a valid date')
  .refine(
    (date) => date >= '2000-01-01' && date <= '2099-12-31',
    'Enter a date between 2000 and 2099',
  );

/** A calendar month, `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(120, 'Description must be at most 120 characters');

/** How the person entering a shared transaction divided it (mirrors `SplitSpec`). */
export const splitInputSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('equal'), userIds: z.array(z.uuid()).min(1) }),
  z.object({
    method: z.literal('percentage'),
    shares: z
      .array(
        z.object({
          userId: z.uuid(),
          basisPoints: z.number().int().min(1).max(PERCENT_SCALE),
        }),
      )
      .min(1),
  }),
  z.object({
    method: z.literal('fixed'),
    shares: z.array(z.object({ userId: z.uuid(), amount: amountMinorSchema })).min(1),
  }),
]);

export type SplitInput = z.infer<typeof splitInputSchema>;

export const SPLIT_PROBLEM_MESSAGES: Record<SplitProblem, string> = {
  'no-members': 'Choose at least one person',
  'duplicate-member': 'Each person can appear only once',
  'invalid-value': 'Every share must be greater than zero',
  'percentage-total': 'Percentages must add up to 100%',
  'fixed-total': 'Amounts must add up to the total',
};

const baseInput = {
  kind: transactionKindSchema,
  amount: amountMinorSchema,
  occurredOn: occurredOnSchema,
  description: descriptionSchema,
  categoryId: z.uuid().nullable(),
};

/**
 * Create and update bodies. Private transactions carry no payer or split: the author paid
 * and owns it. Shared ones name the payer (for income: who received it) and the split.
 */
export const transactionInputSchema = z
  .discriminatedUnion('visibility', [
    z.object({ ...baseInput, visibility: z.literal('private') }),
    z.object({
      ...baseInput,
      visibility: z.literal('shared'),
      paidBy: z.uuid(),
      split: splitInputSchema,
    }),
  ])
  .superRefine((input, ctx) => {
    if (input.visibility !== 'shared') return;
    const problem = splitProblem(input.amount, input.split);
    if (problem)
      ctx.addIssue({ code: 'custom', path: ['split'], message: SPLIT_PROBLEM_MESSAGES[problem] });
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;

/** Updates replace the whole transaction and name the version they were based on. */
export const updateTransactionInputSchema = z.intersection(
  transactionInputSchema,
  z.object({ version: z.number().int().positive() }),
);

export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

const personSchema = z.object({ userId: z.uuid(), displayName: z.string() });
export type TransactionPerson = z.infer<typeof personSchema>;

export const transactionShareSchema = personSchema.extend({
  amount: z.number().int().nonnegative(),
  /** Only for percentage splits: what was entered, so the form reopens as it was. */
  basisPoints: z.number().int().nullable(),
});

export type TransactionShare = z.infer<typeof transactionShareSchema>;

export const transactionSchema = z.object({
  id: z.uuid(),
  kind: transactionKindSchema,
  visibility: transactionVisibilitySchema,
  amount: z.number().int().positive(),
  currency: currencySchema,
  occurredOn: z.iso.date(),
  description: z.string(),
  categoryId: z.uuid().nullable(),
  paidBy: personSchema,
  createdBy: personSchema,
  /** Null for private transactions. Shares always sum to `amount`. */
  split: z
    .object({ method: splitMethodSchema, shares: z.array(transactionShareSchema) })
    .nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Transaction = z.infer<typeof transactionSchema>;

export const transactionResponseSchema = z.object({ transaction: transactionSchema });
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;

/** Query string of the list endpoint. Every filter is optional; results are newest first. */
export const transactionListQuerySchema = z.object({
  month: monthSchema.optional(),
  kind: transactionKindSchema.optional(),
  visibility: transactionVisibilitySchema.optional(),
  categoryId: z.uuid().optional(),
  /** Transactions this member paid or has a share in. */
  memberId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** What a client sends (all optional, limit as text or number). */
export type TransactionListQuery = z.input<typeof transactionListQuerySchema>;
/** After parsing: limit defaulted and coerced. */
export type TransactionListFilters = z.output<typeof transactionListQuerySchema>;

export const transactionListResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});

export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;

export const transactionSummaryQuerySchema = z.object({ month: monthSchema });

/**
 * Month totals of what the caller can see (shared plus their own private transactions).
 * `yourExpenses` is the caller's part: their shares of shared expenses plus their private
 * expenses. Computed by the API because the list is paged.
 */
export const transactionSummarySchema = z.object({
  month: monthSchema,
  currency: currencySchema,
  expenses: z.number().int().nonnegative(),
  income: z.number().int().nonnegative(),
  yourExpenses: z.number().int().nonnegative(),
});

export type TransactionSummary = z.infer<typeof transactionSummarySchema>;

export const transactionSummaryResponseSchema = z.object({ summary: transactionSummarySchema });
export type TransactionSummaryResponse = z.infer<typeof transactionSummaryResponseSchema>;

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'restore'] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** One change to a transaction: who, when, and the transaction before and after. */
export const transactionHistoryEntrySchema = z.object({
  id: z.uuid(),
  action: auditActionSchema,
  actor: personSchema,
  createdAt: z.iso.datetime({ offset: true }),
  before: transactionSchema.nullable(),
  after: transactionSchema.nullable(),
});

export type TransactionHistoryEntry = z.infer<typeof transactionHistoryEntrySchema>;

export const transactionHistoryResponseSchema = z.object({
  entries: z.array(transactionHistoryEntrySchema),
});

export type TransactionHistoryResponse = z.infer<typeof transactionHistoryResponseSchema>;
