import { describe, expect, it } from 'vitest';
import {
  transactionInputSchema,
  transactionListQuerySchema,
  updateTransactionInputSchema,
} from './transactions';

const anna = '0192a3b4-0000-7000-8000-000000000001';
const ben = '0192a3b4-0000-7000-8000-000000000002';

const shared = {
  visibility: 'shared',
  kind: 'expense',
  amount: 10_000,
  occurredOn: '2026-10-10',
  description: ' Groceries ',
  categoryId: null,
  paidBy: anna,
  split: { method: 'equal', userIds: [anna, ben] },
};

const issuesAt = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

describe('transactionInputSchema', () => {
  it('accepts a shared transaction and trims the description', () => {
    const parsed = transactionInputSchema.parse(shared);
    expect(parsed.description).toBe('Groceries');
  });

  it('drops payer and split from a private transaction', () => {
    const parsed = transactionInputSchema.parse({ ...shared, visibility: 'private' });
    expect(parsed).not.toHaveProperty('split');
    expect(parsed).not.toHaveProperty('paidBy');
  });

  it('requires payer and split for shared transactions', () => {
    expect(transactionInputSchema.safeParse({ ...shared, split: undefined }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...shared, paidBy: undefined }).success).toBe(false);
  });

  it('checks that the split adds up', () => {
    const result = transactionInputSchema.safeParse({
      ...shared,
      split: {
        method: 'percentage',
        shares: [
          { userId: anna, basisPoints: 6000 },
          { userId: ben, basisPoints: 3000 },
        ],
      },
    });
    expect(issuesAt(result)).toEqual(['split: Percentages must add up to 100%']);

    const fixed = transactionInputSchema.safeParse({
      ...shared,
      split: { method: 'fixed', shares: [{ userId: anna, amount: 9_000 }] },
    });
    expect(issuesAt(fixed)).toEqual(['split: Amounts must add up to the total']);
  });

  it('rejects floats, zero, impossible dates and empty descriptions', () => {
    for (const patch of [
      { amount: 10.5 },
      { amount: 0 },
      { occurredOn: '2026-02-30' },
      { occurredOn: '1999-12-31' },
      { description: '   ' },
    ]) {
      expect(transactionInputSchema.safeParse({ ...shared, ...patch }).success).toBe(false);
    }
  });

  it('needs a version for updates', () => {
    expect(updateTransactionInputSchema.safeParse(shared).success).toBe(false);
    expect(updateTransactionInputSchema.parse({ ...shared, version: 3 }).version).toBe(3);
  });
});

describe('transactionListQuerySchema', () => {
  it('coerces the limit and defaults it', () => {
    expect(transactionListQuerySchema.parse({}).limit).toBe(50);
    expect(transactionListQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(transactionListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('accepts a month as YYYY-MM only', () => {
    expect(transactionListQuerySchema.safeParse({ month: '2026-10' }).success).toBe(true);
    expect(transactionListQuerySchema.safeParse({ month: '2026-13' }).success).toBe(false);
  });
});
