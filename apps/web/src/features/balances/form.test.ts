import type { Debt } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { describeDebt, pairBalance, splitDebts } from './debts';
import {
  newSettlementValues,
  parseSettlementInput,
  remainingHint,
  settlementDefaults,
  settlementFormSchema,
} from './form';

const anna = { userId: '01a1216a-b248-781c-9cc6-000000000001', displayName: 'Anna' };
const bela = { userId: '01a1216a-b248-781c-9cc6-000000000002', displayName: 'Bela' };
const cili = { userId: '01a1216a-b248-781c-9cc6-000000000003', displayName: 'Cili' };

/** Intl writes no-break spaces in amounts ("12 000 Ft"); compare them as plain spaces. */
const plain = (text: string | undefined) => text?.replace(/\s/g, ' ');

const debts: Debt[] = [
  { from: bela, to: anna, amount: 12_000 },
  { from: anna, to: cili, amount: 3000 },
  { from: cili, to: bela, amount: 1500 },
];

describe('debts', () => {
  it("separates the viewer's debts from everyone else's", () => {
    const { mine, others } = splitDebts(debts, anna.userId);
    expect(mine.map((d) => describeDebt(d, anna.userId))).toEqual([
      'Bela owes you',
      'You owe Cili',
    ]);
    expect(others.map((d) => describeDebt(d, anna.userId))).toEqual(['Cili owes Bela']);
  });

  it('gives the balance with one person, positive when they owe the viewer', () => {
    expect(pairBalance(debts, anna.userId, bela.userId)).toBe(12_000);
    expect(pairBalance(debts, anna.userId, cili.userId)).toBe(-3000);
    expect(pairBalance([], anna.userId, cili.userId)).toBe(0);
  });
});

describe('settlement form', () => {
  it('prefills the whole debt, paid by whoever owes', () => {
    const owed = settlementDefaults(bela.userId, 12_000, 'HUF');
    expect({ ...owed, amount: plain(owed.amount) }).toEqual({
      counterpartId: bela.userId,
      direction: 'they-paid',
      amount: '12 000',
    });
    expect(settlementDefaults(cili.userId, -3000, 'HUF')).toMatchObject({
      direction: 'you-paid',
      amount: '3000',
    });
    expect(settlementDefaults(cili.userId, 0, 'HUF')).toMatchObject({
      direction: 'you-paid',
      amount: '',
    });
  });

  it('turns the direction into from and to', () => {
    const values = { ...newSettlementValues(bela.userId, 12_000, 'HUF'), note: ' cash ' };
    expect(parseSettlementInput(values, anna.userId, 'HUF')).toMatchObject({
      fromUserId: bela.userId,
      toUserId: anna.userId,
      amount: 12_000,
      note: 'cash',
    });
    const youPaid = { ...values, direction: 'you-paid' as const, note: '' };
    expect(parseSettlementInput(youPaid, anna.userId, 'HUF')).toMatchObject({
      fromUserId: anna.userId,
      toUserId: bela.userId,
      note: null,
    });
  });

  it('reports a missing amount on the amount field', () => {
    const schema = settlementFormSchema(anna.userId, 'HUF');
    const result = schema.safeParse({ ...newSettlementValues(bela.userId, 0, 'HUF') });
    expect(result.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [['amount'], 'Enter an amount'],
    ]);
  });

  it('says what is left after a partial, full or too large payment', () => {
    const hint = (direction: 'they-paid' | 'you-paid', amount: string, balance = 12_000) =>
      plain(remainingHint(balance, { direction, amount }, bela, 'HUF')?.text);

    expect(hint('they-paid', '10 000')).toBe('After this, Bela still owes you 2000 Ft');
    expect(hint('they-paid', '12 000')).toBe("You're all square after this");
    expect(hint('they-paid', '15 000')).toBe(
      "That's 3000 Ft more than the debt: you owe Bela 3000 Ft",
    );
    expect(hint('you-paid', '1000', -3000)).toBe('After this, you still owe Bela 2000 Ft');
    expect(hint('you-paid', '500', 0)).toBe('After this, Bela owes you 500 Ft');
    expect(hint('they-paid', '')).toBeUndefined();
  });
});
