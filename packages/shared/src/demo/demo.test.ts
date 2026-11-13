import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, defaultCategories } from '../categories';
import { EXCLUDED_BY_DEFAULT, parseStatement, type StatementFlag } from '../imports';
import {
  assignPayments,
  detectRecurring,
  nextDueOn,
  type RecurringRow,
  seriesTiming,
} from '../recurring';
import { PERCENT_SCALE } from '../splits';
import { demoParseOptions, renderDemoBankFiles } from './bank-files';
import { DEMO_TEXT } from './locale';
import { createRandom } from './random';
import {
  buildDemoStory,
  DEMO_MONTHS,
  demoBalance,
  type DemoPerson,
  demoShares,
  type DemoStory,
} from './story';

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

describe('the story as recurring payments', () => {
  /** What a person sees of the story, as the app would hold it after the imports. */
  function seenBy(s: DemoStory, viewer: DemoPerson): RecurringRow[] {
    const party = new Map(
      s.bankRows.flatMap((r) =>
        r.ref && 'transaction' in r.ref ? [[r.ref.transaction, r.party]] : [],
      ),
    );
    return s.transactions
      .filter((t) => t.share.visibility === 'shared' || t.person === viewer)
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        visibility: t.share.visibility,
        createdBy: t.person,
        amount: t.amount,
        occurredOn: t.occurredOn,
        counterparty: party.get(t.id) ?? null,
        description: t.description,
        categoryId: null,
      }));
  }

  const SHARED = ['kovacs ingatlan kft.', 'netflix', 'spotify', 'telekom'];
  /** The gas and electricity bill swings with the seasons: found in some years, not others. */
  const SOMETIMES = 'mvm next energiakereskedelmi zrt.';

  it.each([
    [1, '2026-10-28'],
    [7, '2026-03-01'],
    [42, '2028-02-29'],
    [99, '2026-12-31'],
  ])('finds the subscriptions and bills for seed %i on %s', (seed, today) => {
    const s = buildDemoStory({ seed, today });
    const keys = (viewer: DemoPerson, kind: 'expense' | 'income' = 'expense') =>
      detectRecurring(seenBy(s, viewer), { today })
        .filter((found) => found.kind === kind)
        .map((found) => `${found.scope}:${found.key}`)
        .filter((key) => key !== `shared:${SOMETIMES}`)
        .sort();
    const shared = SHARED.map((key) => `shared:${key}`);
    // Private ones only for their owner: the visitor's phone plan and pass, the partner's
    // pass and bank fee. The gym stopped, so it is no suggestion for anyone.
    expect(keys('you')).toEqual([...shared, 'private:bkk automata', 'private:yettel'].sort());
    expect(keys('partner')).toEqual(
      [...shared, 'private:account fee', 'private:bkk online'].sort(),
    );
    // Income: each one's salary, private like the income itself.
    expect(keys('you', 'income')).toEqual(['private:acme kft']);
    expect(keys('partner', 'income')).toEqual(['private:globex zrt.']);
  });

  it.each([
    [1, '2026-10-28'],
    [5, '2026-11-01'],
    [8, '2026-02-14'],
    [13, '2026-12-31'],
  ])('sets up recurring payments the seeder can make for seed %i on %s', (seed, today) => {
    const s = buildDemoStory({ seed, today });
    for (const confirmed of s.recurring.confirmed) {
      const found = detectRecurring(seenBy(s, confirmed.person), { today });
      expect(
        found.some(
          (f) =>
            f.scope === confirmed.scope && f.kind === confirmed.kind && f.key === confirmed.key,
        ),
      ).toBe(true);
    }
    const categories = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
    for (const added of s.recurring.added) {
      expect(categories.has(added.category)).toBe(true);
      const series = {
        id: added.name,
        kind: 'expense' as const,
        ownerId: null,
        pattern: added.pattern,
        amount: added.amount,
        amountVaries: false,
        startsOn: null,
      };
      const payments = assignPayments([series], seenBy(s, added.person)).payments.get(added.name);
      // Every payment since the first one belongs to it.
      expect(payments?.at(-1)?.occurredOn).toBe(added.anchorOn);
    }
  });

  it('shows the Netflix price rise and the gym going quiet', () => {
    const today = '2026-11-04';
    const s = buildDemoStory({ seed: 1, today });
    const rows = seenBy(s, 'you');
    const netflix = detectRecurring(rows, { today }).find((found) => found.key === 'netflix');
    expect(netflix).toMatchObject({ amount: 4_990, previousAmount: 4_990, amountVaries: true });

    const gym = {
      id: 'gym',
      kind: 'expense' as const,
      ownerId: null,
      pattern: 'fitness park',
      amount: 14_900,
      amountVaries: false,
      startsOn: null,
    };
    const payments = assignPayments([gym], rows).payments.get('gym') ?? [];
    expect(payments).toHaveLength(8);
    const lastPaidOn = payments[0]?.occurredOn ?? null;
    expect(lastPaidOn).toBe('2026-07-03');
    const next = nextDueOn({ anchorOn: '2025-12-03', cadence: 'monthly' }, lastPaidOn, today);
    expect(seriesTiming(next, 'monthly', today).timing).toBe('lapsed');
  });
});

describe('the story as savings', () => {
  const held = (s: DemoStory, goal: string, person?: DemoPerson) =>
    s.savings.entries
      .filter((e) => e.goal === goal && (person === undefined || e.person === person))
      .reduce((sum, e) => sum + e.amount, 0);

  it('saves for a holiday together, for emergencies alone, and keeps a pot', () => {
    expect(story.savings.goals.map((g) => [g.name, g.visibility, g.targetAmount])).toEqual([
      ['Summer in Italy', 'shared', 600_000],
      ['Emergency fund', 'private', 2_000_000],
      ['Rainy day pot', 'shared', null],
    ]);
    // Eight months of both putting in, less the deposit: past halfway, short of 75%.
    expect(held(story, 'holiday', 'you')).toBe(185_000);
    expect(held(story, 'holiday', 'partner')).toBe(200_000);
    expect(held(story, 'emergency')).toBe(600_000);
    expect(held(story, 'pot')).toBe(60_000);
    // The holiday is ahead of the story's day, on the first of a month.
    expect(story.savings.goals[0]?.targetDate).toBe('2027-06-01');
    expect(story.savings.goals.filter((g) => g.pinnedBy.includes('you'))).toHaveLength(2);
  });

  it('names known goals and people, and never takes a goal below zero', () => {
    const ids = new Set(story.savings.goals.map((g) => g.id));
    const balance = new Map<string, number>();
    let previous = '';
    for (const entry of story.savings.entries) {
      expect(ids.has(entry.goal)).toBe(true);
      expect(entry.amount).not.toBe(0);
      expect(entry.entryOn >= previous).toBe(true);
      previous = entry.entryOn;
      const next = (balance.get(entry.goal) ?? 0) + entry.amount;
      expect(next).toBeGreaterThanOrEqual(0);
      balance.set(entry.goal, next);
      // Only its maker reaches a private goal.
      const goal = story.savings.goals.find((g) => g.id === entry.goal);
      if (goal?.visibility === 'private') expect(entry.person).toBe(goal.person);
    }
    for (const goal of story.savings.goals) {
      if (goal.visibility === 'private') expect(goal.pinnedBy).toEqual([goal.person]);
    }
  });

  it('has nothing after today, also early in a month', () => {
    const early = buildDemoStory({ seed: 1, today: '2026-10-06' });
    expect(early.savings.entries.every((e) => e.entryOn <= '2026-10-06')).toBe(true);
    // Only the visitor's holiday money (the 5th) is in by the 6th.
    expect(early.savings.entries.filter((e) => e.entryOn.startsWith('2026-10'))).toEqual([
      { goal: 'holiday', person: 'you', amount: 30_000, entryOn: '2026-10-05', note: null },
    ]);
  });

  it('does not depend on the seed, and leaves the rest of the story as it was', () => {
    const other = buildDemoStory({ seed: 2, today: TODAY });
    expect(other.savings).toEqual(story.savings);
    // Saving is not spending: no transaction or bank row names a goal.
    const names = new Set(story.savings.goals.map((g) => g.name));
    expect(story.transactions.filter((t) => names.has(t.description))).toEqual([]);
  });

  it('is in Hungarian what the couple typed', () => {
    const hu = buildDemoStory({ seed: 1, today: TODAY, locale: 'hu' });
    expect(hu.savings.goals.map((g) => g.name)).toEqual([
      'Nyaralás Olaszországban',
      'Vésztartalék',
      'Esős napokra',
    ]);
    expect(hu.savings.entries.find((e) => e.note !== null)?.note).toBe('Foglaló a szállásra');
    expect(hu.savings.entries.map((e) => e.amount)).toEqual(
      story.savings.entries.map((e) => e.amount),
    );
  });
});

describe('the story in Hungarian', () => {
  const hu = buildDemoStory({ seed: 1, today: TODAY, locale: 'hu' });

  it('gives the same bank files byte for byte: banks do not translate', () => {
    expect(renderDemoBankFiles(hu)).toEqual(renderDemoBankFiles(story));
  });

  it('translates what the couple typed and names the Hungarian default categories', () => {
    expect(hu.locale).toBe('hu');
    expect(hu.householdName).toBe('Doe család');
    expect(hu.transactions.map((t) => t.id)).toEqual(story.transactions.map((t) => t.id));
    expect(hu.transactions.some((t) => t.description === 'Albérlet')).toBe(true);
    expect(new Set(hu.settlements.map((s) => s.note))).toEqual(
      new Set(['Lakbér része', 'Elszámolás']),
    );

    const names = new Set(defaultCategories('hu').map((c) => `${c.kind}:${c.name}`));
    const used = [
      ...hu.transactions.flatMap((t) => (t.category ? [`${t.kind}:${t.category}`] : [])),
      ...hu.rules.map((r) => `expense:${r.category}`),
      ...hu.budgets.map((b) => `expense:${b.category}`),
      ...hu.recurring.added.map((a) => `expense:${a.category}`),
    ];
    expect(used.filter((name) => !names.has(name))).toEqual([]);
  });

  it('has no stale words: every translated text appears in the English story', () => {
    const typed = new Set([
      story.householdName,
      ...story.transactions.map((t) => t.description),
      ...story.settlements.map((s) => s.note),
      ...story.recurring.added.map((a) => a.name),
      ...story.savings.goals.map((g) => g.name),
      ...story.savings.entries.flatMap((e) => (e.note === null ? [] : [e.note])),
    ]);
    expect(Object.keys(DEMO_TEXT.hu).filter((word) => !typed.has(word))).toEqual([]);
  });
});
