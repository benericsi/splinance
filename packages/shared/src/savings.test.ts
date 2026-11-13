import { describe, expect, it } from 'vitest';
import { importRowSchema, savingsEntryAmount } from './imports';
import { firstMatchingSavingsRule } from './savings';

const goalId = '01a1250a-8673-7669-9f80-8f4006ca5e01';

describe('firstMatchingSavingsRule', () => {
  const rules = [
    { id: 'a', pattern: 'Nyaralás zseb' },
    { id: 'b', pattern: 'pocket' },
  ];

  it('finds the first rule in the counterparty or the description, accents and case aside', () => {
    expect(
      firstMatchingSavingsRule(rules, { counterparty: null, description: 'To NYARALAS ZSEB' })?.id,
    ).toBe('a');
    expect(
      firstMatchingSavingsRule(rules, { counterparty: 'Holiday Pocket', description: 'x' })?.id,
    ).toBe('b');
  });

  it('finds nothing without a match', () => {
    expect(
      firstMatchingSavingsRule(rules, { counterparty: 'TESCO', description: 'Tesco' }),
    ).toBeUndefined();
  });
});

describe('savings import rows', () => {
  const savings = { goalId, kind: 'expense', amount: 5_000, entryOn: '2026-09-01', note: null };

  it('puts money that left the account into the goal, and takes money that came in out', () => {
    expect(savingsEntryAmount({ ...savings, kind: 'expense' })).toBe(5_000);
    expect(savingsEntryAmount({ ...savings, kind: 'income' })).toBe(-5_000);
  });

  it('accepts a savings row next to a transaction row', () => {
    const parsed = importRowSchema.parse({ fingerprint: 'rev:1', savings });
    expect('savings' in parsed).toBe(true);
    expect(() =>
      importRowSchema.parse({ fingerprint: 'rev:1', savings: { ...savings, amount: 0 } }),
    ).toThrow();
  });
});
