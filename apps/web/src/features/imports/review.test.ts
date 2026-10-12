import type { ImportCheckResult, StatementRow } from '@splinance/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { readBankNames, rememberBankName } from './bank-names';
import { buildReview, rowsToCheck, toImportInput, updatePicked } from './review';

const row = (overrides: Partial<StatementRow>): StatementRow => ({
  line: 2,
  fingerprint: 'kh:1',
  occurredOn: '2026-10-10',
  kind: 'expense',
  amount: 9550,
  currency: 'HUF',
  description: 'Pizza Place',
  counterparty: 'Pizza Place',
  flags: [],
  ...overrides,
});

const rows: StatementRow[] = [
  row({}),
  row({ line: 3, fingerprint: 'kh:2', description: 'Lidl', amount: 2306 }),
  row({ line: 4, fingerprint: 'kh:3', description: 'Revolut 1234', flags: ['own-transfer'] }),
  row({ line: 5, fingerprint: 'kh:4', description: 'ATM', flags: ['cash-withdrawal'] }),
  row({ line: 6, fingerprint: null, description: 'Card hold', flags: ['pending'] }),
  row({ line: 7, fingerprint: 'kh:5', description: 'Cafe Wien', currency: 'EUR' }),
  row({ line: 8, fingerprint: 'kh:6', description: 'Old one' }),
  row({ line: 9, fingerprint: 'kh:7', description: 'Salary', kind: 'income', amount: 420_165 }),
];

const results: ImportCheckResult[] = [
  { fingerprint: 'kh:1', status: 'new', match: null },
  {
    fingerprint: 'kh:2',
    status: 'possible-duplicate',
    match: {
      id: '01a1250a-8673-7669-9f80-8f4006ca5e01',
      description: 'Groceries',
      occurredOn: '2026-10-09',
    },
  },
  { fingerprint: 'kh:3', status: 'new', match: null },
  { fingerprint: 'kh:4', status: 'new', match: null },
  { fingerprint: 'kh:6', status: 'imported', match: null },
  { fingerprint: 'kh:7', status: 'undone', match: null },
];

describe('rowsToCheck', () => {
  it('sends only rows that could be imported', () => {
    expect(rowsToCheck(rows, 'HUF').map((r) => r.fingerprint)).toEqual([
      'kh:1',
      'kh:2',
      'kh:3',
      'kh:4',
      'kh:6',
      'kh:7',
    ]);
  });
});

describe('buildReview', () => {
  const review = buildReview(rows, results, 'HUF');
  const byDescription = (description: string) => review.find((r) => r.description === description);

  it('groups rows by what needs a decision, with a reason for each', () => {
    expect(review.map((r) => [r.description, r.group, r.included])).toEqual([
      ['Pizza Place', 'ready', true],
      ['Lidl', 'needs-look', false],
      ['Revolut 1234', 'needs-look', false],
      ['ATM', 'needs-look', false],
      ['Card hold', 'left-out', false],
      ['Cafe Wien', 'left-out', false],
      ['Old one', 'left-out', false],
      // Its import was undone: importing it again is the point.
      ['Salary', 'ready', true],
    ]);
    expect(byDescription('Lidl')?.reason).toMatch(/^Maybe already added: "Groceries", /);
    expect(byDescription('Revolut 1234')?.reason).toBe(
      'Looks like a transfer between your own accounts',
    );
    expect(byDescription('Card hold')?.key).toBe('line:6');
    expect(byDescription('Cafe Wien')?.reason).toBe('In EUR: other currencies come later');
    expect(byDescription('Old one')?.reason).toBe('Already imported');
  });

  it('starts private and without a category', () => {
    expect(byDescription('Pizza Place')).toMatchObject({ visibility: 'private', categoryId: '' });
  });

  it('applies bulk changes to picked rows of the right kind only', () => {
    const updated = updatePicked(review, { categoryId: 'cat-food' }, 'expense');
    expect(updated.find((r) => r.description === 'Pizza Place')?.categoryId).toBe('cat-food');
    expect(updated.find((r) => r.description === 'Salary')?.categoryId).toBe('');
    expect(updated.find((r) => r.description === 'Lidl')?.categoryId).toBe('');
  });
});

describe('toImportInput', () => {
  it('sends picked rows as private or shared transactions with their origin', () => {
    const review = buildReview(rows, results, 'HUF').map((r) => {
      if (r.description === 'Pizza Place') return { ...r, visibility: 'shared' as const };
      if (r.description === 'Salary') return { ...r, description: '  ', categoryId: 'cat-pay' };
      // Picking a left-out row does nothing.
      if (r.description === 'Old one') return { ...r, included: true };
      return r;
    });
    const input = toImportInput(review, {
      source: 'kh',
      fileName: 'export.csv',
      viewerId: 'anna',
      memberIds: ['anna', 'ben'],
    });
    expect(input.rows).toEqual([
      {
        fingerprint: 'kh:1',
        counterparty: 'Pizza Place',
        transaction: {
          visibility: 'shared',
          kind: 'expense',
          amount: 9550,
          occurredOn: '2026-10-10',
          description: 'Pizza Place',
          categoryId: null,
          paidBy: 'anna',
          split: { method: 'equal', userIds: ['anna', 'ben'] },
        },
      },
      {
        fingerprint: 'kh:7',
        counterparty: 'Pizza Place',
        transaction: {
          visibility: 'private',
          kind: 'income',
          amount: 420_165,
          occurredOn: '2026-10-10',
          // An emptied description falls back to the bank's.
          description: 'Salary',
          categoryId: 'cat-pay',
        },
      },
    ]);
  });
});

describe('bank names', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('remembers names per user, once each', () => {
    rememberBankName('u1', 'KOVÁCS ANNA');
    rememberBankName('u1', 'Anna Kovacs');
    rememberBankName('u1', 'Anna K. Szabó');
    expect(readBankNames('u1')).toEqual(['Anna K. Szabó', 'KOVÁCS ANNA']);
    expect(readBankNames('u2')).toEqual([]);
  });
});
