import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../categories';
import { EXCLUDED_BY_DEFAULT, parseStatement, type StatementFlag } from '../imports';
import { PERCENT_SCALE } from '../splits';
import { demoParseOptions, renderDemoBankFiles } from './bank-files';
import { createRandom } from './random';
import { buildDemoStory, DEMO_MONTHS, demoBalance, demoShares, type DemoStory } from './story';

const TODAY = '2026-10-28';
const story = buildDemoStory({ seed: 1, today: TODAY });

/** Shared expenses in a category and month, as a household budget counts them. */
const sharedSpent = (s: DemoStory, category: string, month: string) =>
  s.transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.share.visibility === 'shared' &&
        t.category === category &&
        t.occurredOn.startsWith(month),
    )
    .reduce((sum, t) => sum + t.amount, 0);

describe('createRandom', () => {
  it('repeats its sequence for a seed and stays in range', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const values = Array.from({ length: 1000 }, () => a.int(3, 7));
    expect(values).toEqual(Array.from({ length: 1000 }, () => b.int(3, 7)));
    expect(new Set(values)).toEqual(new Set([3, 4, 5, 6, 7]));
    expect(createRandom(43).next()).not.toBe(createRandom(42).next());
  });
});

describe('buildDemoStory', () => {
  it('is the same for the same seed and day, and varies with the seed', () => {
    expect(buildDemoStory({ seed: 1, today: TODAY })).toEqual(story);
    const other = buildDemoStory({ seed: 2, today: TODAY });
    expect(other.transactions.map((t) => t.amount)).not.toEqual(
      story.transactions.map((t) => t.amount),
    );
  });

  it('refuses a bad seed or day', () => {
    expect(() => buildDemoStory({ seed: -1, today: TODAY })).toThrow(RangeError);
    expect(() => buildDemoStory({ seed: 1.5, today: TODAY })).toThrow(RangeError);
    expect(() => buildDemoStory({ seed: 1, today: '2026-02-30' })).toThrow(RangeError);
  });

  it('covers the 12 months up to today and nothing after it', () => {
    expect(story.months).toHaveLength(DEMO_MONTHS);
    expect(story.months[0]).toBe('2025-11');
    expect(story.months.at(-1)).toBe('2026-10');
    const dates = [
      ...story.transactions.map((t) => t.occurredOn),
      ...story.settlements.map((s) => s.settledOn),
      ...story.bankRows.map((r) => r.occurredOn),
    ];
    expect(dates.every((date) => date >= '2025-11-01' && date <= TODAY)).toBe(true);
    for (const month of story.months) {
      expect(
        story.transactions.filter((t) => t.occurredOn.startsWith(month)).length,
      ).toBeGreaterThan(15);
    }
  });

  it('only makes transactions the app accepts', () => {
    const categories = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, c.kind]));
    for (const t of story.transactions) {
      expect(Number.isSafeInteger(t.amount) && t.amount > 0).toBe(true);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.description.length).toBeLessThanOrEqual(120);
      if (t.category !== null) expect(categories.get(t.category)).toBe(t.kind);
      if (t.share.visibility === 'shared' && t.share.split.method === 'percentage') {
        expect(t.share.split.you).toBeGreaterThan(0);
        expect(t.share.split.you).toBeLessThan(PERCENT_SCALE);
      }
      if (t.share.visibility === 'shared' && t.share.split.method === 'fixed') {
        expect(t.share.split.you).toBeGreaterThan(0);
        expect(t.share.split.you).toBeLessThan(t.amount);
      }
      const shares = demoShares(t);
      if (shares) expect(shares.you + shares.partner).toBe(t.amount);
    }
    for (const rule of story.rules) expect(categories.has(rule.category)).toBe(true);
    for (const budget of story.budgets) expect(categories.get(budget.category)).toBe('expense');
  });

  it('links every imported transaction and settlement to bank rows', () => {
    const refs = story.bankRows.flatMap((row) => (row.ref ? [row.ref] : []));
    for (const t of story.transactions) {
      const count = refs.filter((ref) => 'transaction' in ref && ref.transaction === t.id).length;
      expect(count).toBe(t.source === 'bank' ? 1 : 0);
    }
    for (const s of story.settlements) {
      expect(refs.filter((ref) => 'settlement' in ref && ref.settlement === s.id)).toHaveLength(2);
    }
  });

  it('settles every quarter and leaves the last months open', () => {
    const settleUps = story.settlements.filter((s) => s.note === 'Settling up');
    expect(settleUps.map((s) => s.settledOn.slice(0, 7))).toEqual([
      '2026-01',
      '2026-04',
      '2026-07',
    ]);
    for (const s of settleUps)
      expect(Math.abs(demoBalance(story, s.settledOn))).toBeLessThan(1_000);
    expect(Math.abs(demoBalance(story))).toBeGreaterThan(5_000);
  });

  it.each(['2026-10-28', '2026-03-01', '2028-02-29', '2026-12-31'])(
    'keeps the current month believable on %s',
    (today) => {
      const s = buildDemoStory({ seed: 7, today });
      const month = today.slice(0, 7);
      expect(s.transactions.filter((t) => t.occurredOn.startsWith(month)).length).toBeGreaterThan(
        0,
      );
      expect(s.transactions.every((t) => t.occurredOn <= today)).toBe(true);
      // The overview's budget alert starts at 80%.
      const eatingOut = s.budgets.find((b) => b.category === 'Eating out')?.amount ?? 0;
      const spent = sharedSpent(s, 'Eating out', month);
      expect(spent / eatingOut).toBeGreaterThanOrEqual(0.85);
      expect(spent / eatingOut).toBeLessThan(0.94);
    },
  );
});

describe('renderDemoBankFiles', () => {
  const files = renderDemoBankFiles(story);
  const rowsById = new Map(story.bankRows.map((row) => [row.id, row]));

  it('writes one Revolut and one K&H file per month', () => {
    expect(files.map((f) => f.fileName)).toEqual(
      story.months.flatMap((month) => [`kh-${month}.csv`, `revolut-${month}.csv`]),
    );
    expect(files.flatMap((f) => f.lines)).toHaveLength(story.bankRows.length);
  });

  it('reads back through parseStatement as the rows it was made from', () => {
    for (const file of files) {
      const parsed = parseStatement(file.text, demoParseOptions(file.person));
      expect(parsed.source).toBe(file.source);
      expect(parsed.rows).toHaveLength(file.lines.length);

      for (const parsedRow of parsed.rows) {
        const rowId = file.lines.find((l) => l.line === parsedRow.line)?.rowId;
        const row = rowsById.get(rowId ?? '');
        if (!row)
          throw new Error(`${file.fileName}: no story row on line ${String(parsedRow.line)}`);

        expect(parsedRow.occurredOn).toBe(row.occurredOn);
        expect(parsedRow.amount).toBe(Math.abs(row.amount));
        expect(parsedRow.kind).toBe(row.amount < 0 ? 'expense' : 'income');
        expect(parsedRow.currency).toBe('HUF');
        expect(parsedRow.fingerprint).not.toBeNull();

        const expected: StatementFlag[] = [];
        // Top-ups from an own card, and the visitor's transfers to their own savings.
        if (row.move === 'top-up' || (row.move === 'transfer-out' && row.ref === null)) {
          expected.push('own-transfer');
        }
        if (row.move === 'atm') expected.push('cash-withdrawal');
        if (row.move === 'fee') expected.push('bank-fee');
        expect(parsedRow.flags).toEqual(expected);
        if (row.ref && 'transaction' in row.ref) {
          // Imported rows go in by default, under the bank's name for the party.
          expect(parsedRow.flags.some((f) => EXCLUDED_BY_DEFAULT.includes(f))).toBe(false);
          expect(parsedRow.counterparty).toBe(row.party);
        }
      }
    }
  });

  it('gives every row its own fingerprint across all files', () => {
    const fingerprints = files.flatMap((file) =>
      parseStatement(file.text, demoParseOptions(file.person)).rows.map((r) => r.fingerprint),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('books K&H card purchases the next day, never after today', () => {
    const s = buildDemoStory({ seed: 3, today: '2026-10-01' });
    const kh = renderDemoBankFiles(s).filter((f) => f.source === 'kh');
    expect(kh.at(-1)?.month).toBe('2026-10');
    const lastFile = kh.at(-1)?.text ?? '';
    // The 1 October BKK pass is booked on the 1st (today), not the 2nd.
    expect(lastFile).toContain('2026.10.01\t');
    expect(lastFile).not.toContain('2026.10.02');
  });
});
