import { describe, expect, it } from 'vitest';
import { type DebtFlow, netDebts, settlementInputSchema } from './balances';

const owes = (debtorId: string, creditorId: string, amount: number): DebtFlow => ({
  debtorId,
  creditorId,
  amount,
});

describe('netDebts', () => {
  it('adds up debts in the same direction', () => {
    expect(netDebts([owes('ben', 'anna', 5000), owes('ben', 'anna', 7000)])).toEqual([
      owes('ben', 'anna', 12_000),
    ]);
  });

  it('nets opposite directions within a pair', () => {
    expect(netDebts([owes('ben', 'anna', 5000), owes('anna', 'ben', 3000)])).toEqual([
      owes('ben', 'anna', 2000),
    ]);
    // Overpaying flips who owes whom.
    expect(netDebts([owes('ben', 'anna', 5000), owes('anna', 'ben', 6000)])).toEqual([
      owes('anna', 'ben', 1000),
    ]);
  });

  it('drops pairs that cancel out, self debts and zero amounts', () => {
    expect(
      netDebts([
        owes('ben', 'anna', 5000),
        owes('anna', 'ben', 5000),
        owes('anna', 'anna', 100),
        owes('cara', 'anna', 0),
      ]),
    ).toEqual([]);
  });

  it('never simplifies across pairs', () => {
    // A chain (Cara owes Ben, Ben owes Anna) stays two debts, not "Cara owes Anna".
    expect(netDebts([owes('cara', 'ben', 3000), owes('ben', 'anna', 3000)])).toEqual([
      owes('ben', 'anna', 3000),
      owes('cara', 'ben', 3000),
    ]);
  });

  it('sorts by amount, largest first, then by ids', () => {
    expect(
      netDebts([owes('cara', 'anna', 100), owes('ben', 'anna', 900), owes('ben', 'cara', 100)]),
    ).toEqual([owes('ben', 'anna', 900), owes('ben', 'cara', 100), owes('cara', 'anna', 100)]);
  });

  it('keeps every net position: what a person is owed minus what they owe', () => {
    const flows = [
      owes('ben', 'anna', 4000),
      owes('cara', 'anna', 2500),
      owes('anna', 'cara', 1000),
      owes('cara', 'ben', 700),
      owes('ben', 'cara', 300),
    ];
    const net = (list: DebtFlow[], person: string) =>
      list.reduce(
        (sum, f) =>
          sum + (f.creditorId === person ? f.amount : 0) - (f.debtorId === person ? f.amount : 0),
        0,
      );
    const debts = netDebts(flows);
    for (const person of ['anna', 'ben', 'cara']) {
      expect(net(debts, person)).toBe(net(flows, person));
    }
  });
});

describe('settlementInputSchema', () => {
  const valid = {
    fromUserId: '0199d5a0-0000-7000-8000-000000000001',
    toUserId: '0199d5a0-0000-7000-8000-000000000002',
    amount: 10_000,
    settledOn: '2026-10-12',
    note: '  cash  ',
  };

  it('trims the note', () => {
    expect(settlementInputSchema.parse(valid).note).toBe('cash');
  });

  it('rejects paying yourself', () => {
    const result = settlementInputSchema.safeParse({ ...valid, toUserId: valid.fromUserId });
    expect(result.error?.issues[0]?.path).toEqual(['toUserId']);
  });

  it('rejects zero, fractional and too long input', () => {
    expect(settlementInputSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(settlementInputSchema.safeParse({ ...valid, amount: 1.5 }).success).toBe(false);
    expect(settlementInputSchema.safeParse({ ...valid, note: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});
