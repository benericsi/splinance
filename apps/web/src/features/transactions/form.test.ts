import type { Transaction } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { editTransactionValues, newTransactionValues } from './form';

const anna = { userId: '01a112be-f8eb-73bb-b534-400e393821c3', displayName: 'Anna' };
const bela = { userId: '01a1216a-b248-781c-9cc6-cd68276fcdfc', displayName: 'Bela' };
const cili = { userId: '01a1216a-b248-781c-9cc6-cd68276fcdfd', displayName: 'Cili' };

describe('split rows', () => {
  it('put the viewer first, then the others in joining order', () => {
    const values = newTransactionValues([bela, cili, anna], anna.userId);
    expect(values.shares.map((row) => row.displayName)).toEqual(['Anna', 'Bela', 'Cili']);
    expect(values.paidBy).toBe(anna.userId);
  });

  it('keep people who left at the end when editing', () => {
    const transaction: Transaction = {
      id: '01a1250a-8673-7669-9f80-8f4006ca5ece',
      kind: 'expense',
      visibility: 'shared',
      amount: 900,
      currency: 'HUF',
      occurredOn: '2026-10-10',
      description: 'Dinner',
      categoryId: null,
      paidBy: cili,
      createdBy: bela,
      split: {
        method: 'equal',
        shares: [
          { ...anna, amount: 300, basisPoints: null },
          { ...bela, amount: 300, basisPoints: null },
          { ...cili, amount: 300, basisPoints: null },
        ],
      },
      version: 1,
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
    };

    // Cili left the household: she is no longer among the members.
    const values = editTransactionValues(transaction, [bela, anna], anna.userId);
    expect(values.shares.map((row) => [row.displayName, row.former])).toEqual([
      ['Anna', false],
      ['Bela', false],
      ['Cili', true],
    ]);
  });
});
