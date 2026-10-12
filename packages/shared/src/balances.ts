import { z } from 'zod';
import { currencySchema } from './households';
import { amountMinorSchema } from './money';
import { occurredOnSchema, personSchema } from './transactions';

/** `debtorId` owes `creditorId` `amount` minor units. */
export interface DebtFlow {
  debtorId: string;
  creditorId: string;
  amount: number;
}

/**
 * Nets directed debts per pair of people: "A owes B 5 000" and "B owes A 3 000" become
 * "A owes B 2 000"; pairs that cancel out disappear. No simplification across pairs: a
 * debt always stays between the two people it arose between. Sorted by amount (largest
 * first), then by ids, so the same flows always give the same list.
 */
export function netDebts(flows: readonly DebtFlow[]): DebtFlow[] {
  // Keyed by the pair in id order; `net > 0` means the lower id owes the higher one.
  const pairs = new Map<string, { low: string; high: string; net: number }>();
  for (const flow of flows) {
    if (flow.debtorId === flow.creditorId) continue;
    const debtorIsLow = flow.debtorId < flow.creditorId;
    const low = debtorIsLow ? flow.debtorId : flow.creditorId;
    const high = debtorIsLow ? flow.creditorId : flow.debtorId;
    const key = `${low}|${high}`;
    const pair = pairs.get(key) ?? { low, high, net: 0 };
    pair.net += debtorIsLow ? flow.amount : -flow.amount;
    pairs.set(key, pair);
  }

  const debts: DebtFlow[] = [];
  for (const { low, high, net } of pairs.values()) {
    if (net > 0) debts.push({ debtorId: low, creditorId: high, amount: net });
    if (net < 0) debts.push({ debtorId: high, creditorId: low, amount: -net });
  }
  const byIds = (a: DebtFlow, b: DebtFlow) =>
    `${a.debtorId}|${a.creditorId}` < `${b.debtorId}|${b.creditorId}` ? -1 : 1;
  return debts.sort((a, b) => b.amount - a.amount || byIds(a, b));
}

/** One open debt between two people: `from` owes `to`. */
export const debtSchema = z.object({
  from: personSchema,
  to: personSchema,
  amount: z.number().int().positive(),
});

export type Debt = z.infer<typeof debtSchema>;

/**
 * Who owes whom in a household, per pair. Derived from shared transactions and
 * settlements; people who left are included while a debt with them is open.
 */
export const balancesSchema = z.object({
  currency: currencySchema,
  debts: z.array(debtSchema),
});

export type Balances = z.infer<typeof balancesSchema>;

export const balancesResponseSchema = z.object({ balances: balancesSchema });
export type BalancesResponse = z.infer<typeof balancesResponseSchema>;

export const settlementNoteSchema = z
  .string()
  .trim()
  .max(200, 'Note must be at most 200 characters')
  .nullable();

/**
 * A payment from one person to another, made outside the app (cash, bank transfer) and
 * recorded here. Any amount: partial payments leave the rest open, overpaying flips the
 * debt. Settlements are never edited; a wrong one is deleted and recorded again.
 */
export const settlementInputSchema = z
  .object({
    fromUserId: z.uuid(),
    toUserId: z.uuid(),
    amount: amountMinorSchema,
    settledOn: occurredOnSchema,
    note: settlementNoteSchema,
  })
  .refine((input) => input.fromUserId !== input.toUserId, {
    path: ['toUserId'],
    message: 'Choose two different people',
  });

export type SettlementInput = z.infer<typeof settlementInputSchema>;

export const settlementSchema = z.object({
  id: z.uuid(),
  /** Who paid. */
  from: personSchema,
  /** Who received the money. */
  to: personSchema,
  amount: z.number().int().positive(),
  currency: currencySchema,
  settledOn: z.iso.date(),
  note: z.string().nullable(),
  createdBy: personSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export type Settlement = z.infer<typeof settlementSchema>;

export const settlementResponseSchema = z.object({ settlement: settlementSchema });
export type SettlementResponse = z.infer<typeof settlementResponseSchema>;

/** Newest first (by date, then id), paged with a keyset cursor like transactions. */
export const settlementListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SettlementListQuery = z.input<typeof settlementListQuerySchema>;
export type SettlementListFilters = z.output<typeof settlementListQuerySchema>;

export const settlementListResponseSchema = z.object({
  settlements: z.array(settlementSchema),
  nextCursor: z.string().nullable(),
});

export type SettlementListResponse = z.infer<typeof settlementListResponseSchema>;
