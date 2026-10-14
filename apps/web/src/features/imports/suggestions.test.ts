import type { Rule, StatementRow } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { buildReview, type ReviewRow } from './review';
import { suggestRules } from './suggestions';

const GROCERIES = '01a1250a-0000-7000-8000-000000000001';
const EATING_OUT = '01a1250a-0000-7000-8000-000000000002';

const row = (fingerprint: string, counterparty: string | null, description = counterparty ?? 'x') =>
  ({
    line: 2,
    fingerprint,
    occurredOn: '2026-10-10',
    kind: 'expense',
    amount: 1000,
    currency: 'HUF',
    description,
    counterparty,
    flags: [],
  }) satisfies StatementRow;

const tescoRule: Rule = {
  id: '01a1250a-0000-7000-8000-0000000000aa',
  pattern: 'tesco',
  categoryId: GROCERIES,
  kind: 'expense',
  markShared: true,
  position: 0,
};

const ready = (rows: StatementRow[], rules: Rule[] = []) =>
  buildReview(
    rows,
    rows.map((r) => ({ fingerprint: r.fingerprint ?? '', status: 'new' as const, match: null })),
    'HUF',
    rules,
  );

describe('rules in the review', () => {
  it('fill in the category and shared for matching rows', () => {
    const [tesco, other] = ready(
      [row('a', 'TESCO 44049'), row('b', 'APPLE.COM/BILL')],
      [tescoRule],
    );
    expect(tesco).toMatchObject({
      categoryId: GROCERIES,
      visibility: 'shared',
      rule: { id: tescoRule.id, pattern: 'tesco' },
    });
    expect(other).toMatchObject({ categoryId: '', visibility: 'private', rule: null });
  });
});

describe('suggestRules', () => {
  const pick = (review: ReviewRow, categoryId: string, shared = false): ReviewRow => ({
    ...review,
    categoryId,
    visibility: shared ? 'shared' : 'private',
  });

  it('turns hand-picked categories into one rule per merchant', () => {
    const [a, b, c] = ready([
      row('a', 'Spotify P46ED88101'),
      row('b', 'Spotify P99XX00000'),
      row('c', 'Moto Pizza Madach'),
    ]);
    if (!a || !b || !c) throw new Error('rows');
    expect(
      suggestRules([pick(a, EATING_OUT), pick(b, EATING_OUT), pick(c, EATING_OUT, true)], []),
    ).toEqual([
      {
        key: 'expense:spotify',
        pattern: 'spotify',
        categoryId: EATING_OUT,
        kind: 'expense',
        markShared: false,
        count: 2,
      },
      {
        key: 'expense:moto pizza madach',
        pattern: 'moto pizza madach',
        categoryId: EATING_OUT,
        kind: 'expense',
        markShared: true,
        count: 1,
      },
    ]);
  });

  it('skips what a rule did, mixed categories, existing rules and nameless rows', () => {
    const rows = ready(
      [
        row('a', 'TESCO 44049'),
        row('b', 'foodora'),
        row('c', 'foodora'),
        row('d', null, 'Cash gift'),
        row('e', 'TESCO 41640'),
      ],
      [tescoRule],
    );
    const [byRule, food1, food2, nameless, tescoOverridden] = rows;
    if (!byRule || !food1 || !food2 || !nameless || !tescoOverridden) throw new Error('rows');
    expect(
      suggestRules(
        [
          byRule,
          pick(food1, EATING_OUT),
          pick(food2, GROCERIES),
          pick(nameless, GROCERIES),
          // Changed from the rule's category by hand: the "tesco" rule exists, no new one.
          pick(tescoOverridden, EATING_OUT),
        ],
        [tescoRule],
      ),
    ).toEqual([]);
  });
});
