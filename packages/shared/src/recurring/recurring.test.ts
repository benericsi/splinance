import { describe, expect, it } from 'vitest';
import {
  assignPayments,
  daysBetween,
  detectRecurring,
  monthlyAmount,
  nearestOccurrenceIndex,
  nextDueOn,
  occurrence,
  priceChange,
  type RecurringRow,
  recurringKey,
  recurringKeySchema,
  recurringSeriesInputSchema,
  seriesCovers,
  type SeriesMatcher,
  seriesPayments,
  seriesTiming,
  suggestRecurringPattern,
  updateRecurringSeriesInputSchema,
} from './index';

const ANNA = '0190a000-0000-7000-8000-00000000000a';
const BEN = '0190a000-0000-7000-8000-00000000000b';

let nextId = 0;
function row(values: Partial<RecurringRow> & Pick<RecurringRow, 'occurredOn'>): RecurringRow {
  nextId += 1;
  return {
    id: `tx-${String(nextId).padStart(4, '0')}`,
    kind: 'expense',
    visibility: 'shared',
    createdBy: ANNA,
    amount: 4_490,
    counterparty: 'Netflix.com',
    description: 'Netflix',
    categoryId: null,
    ...values,
  };
}

/** One row per date, otherwise the same. */
const rows = (dates: string[], values: Partial<RecurringRow> = {}) =>
  dates.map((occurredOn) => row({ ...values, occurredOn }));

const monthly = (from: string, count: number, day = from.slice(8, 10)) =>
  Array.from({ length: count }, (_, index) =>
    occurrence(`${from.slice(0, 7)}-${day}`, 'monthly', index),
  );

const series = (values: Partial<SeriesMatcher> = {}): SeriesMatcher => ({
  id: 'series-1',
  kind: 'expense',
  ownerId: null,
  pattern: 'netflix',
  amount: 4_490,
  amountVaries: false,
  startsOn: null,
  ...values,
});

describe('recurringKey (stored: changing an output orphans decisions)', () => {
  it.each([
    ['SPOTIFY P46ED88101', 'Spotify Duo', 'spotify'],
    ['Spotify P46ED88101', 'Spotify Duo', 'spotify'],
    ['Netflix.com', 'Netflix', 'netflix'],
    ['WOLT.COM', 'Dinner', 'wolt'],
    ['TESCO 44049 O NKISZOLG', 'Weekly shop', 'tesco'],
    ['Kovács Ingatlan Kft.', 'Rent', 'kovacs ingatlan kft.'],
    ['BKK Automata', 'BKK monthly pass', 'bkk automata'],
    [null, 'Netflix', 'netflix'],
    ['   ', 'Gyógyszertár', 'gyogyszertar'],
  ])('%s / %s -> %s', (counterparty, description, key) => {
    expect(recurringKey({ counterparty, description })).toBe(key);
  });
});

describe('suggestRecurringPattern (the default match text of a hand-added series)', () => {
  it.each([
    ['Spotify xyz', 'spotify'],
    ['Spotify Premium Duo', 'spotify'],
    ['Netflix Standard', 'netflix'],
    ['Premium YouTube', 'youtube'],
    ['Fitness Park', 'fitness'],
    ['BKK havi bérlet', 'bkk'],
    ['Előfizetés: Telekom', 'telekom'],
    ['dm', 'dm'],
    ['O2', 'o2'],
  ])('%s -> %s', (name, pattern) => {
    expect(suggestRecurringPattern(name)).toBe(pattern);
  });
});

describe('occurrence', () => {
  it('keeps the anchor day of month where the month has it', () => {
    expect([1, 2, 3, 4].map((index) => occurrence('2026-01-31', 'monthly', index))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(occurrence('2026-01-31', 'monthly', -2)).toBe('2025-11-30');
    expect(occurrence('2024-02-29', 'yearly', 1)).toBe('2025-02-28');
    expect(occurrence('2024-02-29', 'yearly', 4)).toBe('2028-02-29');
    expect(occurrence('2026-11-30', 'quarterly', 1)).toBe('2027-02-28');
    expect(occurrence('2026-12-29', 'weekly', 1)).toBe('2027-01-05');
  });
});

describe('nearestOccurrenceIndex and nextDueOn', () => {
  it('tolerates payments that drift a few days', () => {
    expect(nearestOccurrenceIndex('2026-01-07', 'monthly', '2026-04-09')).toBe(3);
    expect(nearestOccurrenceIndex('2026-01-07', 'monthly', '2026-04-04')).toBe(3);
    expect(
      nextDueOn({ anchorOn: '2026-01-07', cadence: 'monthly' }, '2026-04-09', '2026-04-20'),
    ).toBe('2026-05-07');
  });

  it('treats a future anchor as the next payment and a past one as the last', () => {
    const manual = { anchorOn: '2026-11-12', cadence: 'monthly' as const };
    expect(nextDueOn(manual, null, '2026-11-04')).toBe('2026-11-12');
    expect(nextDueOn(manual, null, '2026-11-20')).toBe('2026-12-12');
    expect(nextDueOn(manual, '2026-11-13', '2026-11-20')).toBe('2026-12-12');
  });
});

describe('seriesTiming', () => {
  it('separates lapsed, due, soon and later', () => {
    expect(seriesTiming('2026-11-07', 'monthly', '2026-11-04')).toEqual({
      timing: 'soon',
      daysUntil: 3,
    });
    expect(seriesTiming('2026-11-11', 'monthly', '2026-11-04').timing).toBe('soon');
    expect(seriesTiming('2026-11-12', 'monthly', '2026-11-04').timing).toBe('later');
    expect(seriesTiming('2026-11-04', 'monthly', '2026-11-04').timing).toBe('due');
    expect(seriesTiming('2026-10-28', 'monthly', '2026-11-04').timing).toBe('due');
    expect(seriesTiming('2026-10-27', 'monthly', '2026-11-04').timing).toBe('lapsed');
    expect(seriesTiming('2026-10-27', 'yearly', '2026-11-04').timing).toBe('due');
  });
});

describe('monthlyAmount and priceChange', () => {
  it('normalizes to a month', () => {
    expect(monthlyAmount(1_000, 'weekly')).toBe(4_333);
    expect(monthlyAmount(4_490, 'monthly')).toBe(4_490);
    expect(monthlyAmount(30_000, 'quarterly')).toBe(10_000);
    expect(monthlyAmount(35_880, 'yearly')).toBe(2_990);
  });

  it('ignores differences of 2% or less', () => {
    expect(priceChange(4_990, 4_490)).toBeCloseTo(0.111, 3);
    expect(priceChange(4_000, 4_490)).toBeCloseTo(-0.109, 3);
    expect(priceChange(4_550, 4_490)).toBeNull();
    expect(priceChange(4_490, null)).toBeNull();
  });
});

describe('seriesCovers', () => {
  it('matches the pattern in the counterparty or the description, accents and case aside', () => {
    expect(seriesCovers(series(), row({ occurredOn: '2026-10-07' }))).toBe(true);
    expect(
      seriesCovers(
        series({ pattern: 'Spotify' }),
        row({ occurredOn: '2026-10-12', counterparty: 'SPOTIFY P46ED88101', description: 'x' }),
      ),
    ).toBe(true);
    expect(seriesCovers(series({ pattern: 'hbo' }), row({ occurredOn: '2026-10-07' }))).toBe(false);
  });

  it('never lets a shared series see a private row; a private series sees what its owner sees', () => {
    const annasPrivate = row({ occurredOn: '2026-10-07', visibility: 'private', createdBy: ANNA });
    const shared = row({ occurredOn: '2026-10-07', createdBy: BEN });
    expect(seriesCovers(series(), annasPrivate)).toBe(false);
    expect(seriesCovers(series(), shared)).toBe(true);
    expect(seriesCovers(series({ ownerId: ANNA }), annasPrivate)).toBe(true);
    expect(seriesCovers(series({ ownerId: ANNA }), shared)).toBe(true);
    expect(seriesCovers(series({ ownerId: BEN }), annasPrivate)).toBe(false);
  });

  it('respects the kind and the start date', () => {
    expect(seriesCovers(series(), row({ occurredOn: '2026-10-07', kind: 'income' }))).toBe(false);
    expect(
      seriesCovers(series({ startsOn: '2026-10-08' }), row({ occurredOn: '2026-10-07' })),
    ).toBe(false);
  });
});

describe('seriesPayments', () => {
  it('follows a price rise but leaves out a different purchase at the same merchant', () => {
    const payments = seriesPayments(series({ amount: 4_990 }), [
      row({ occurredOn: '2026-07-07', amount: 4_490 }),
      row({ occurredOn: '2026-08-07', amount: 4_490 }),
      row({ occurredOn: '2026-09-07', amount: 4_990 }),
      row({ occurredOn: '2026-09-20', amount: 25_000 }),
      row({ occurredOn: '2026-10-07', amount: 4_990 }),
    ]);
    expect(payments.map((p) => [p.occurredOn, p.amount])).toEqual([
      ['2026-10-07', 4_990],
      ['2026-09-07', 4_990],
      ['2026-08-07', 4_490],
      ['2026-07-07', 4_490],
    ]);
  });

  it('allows a wide swing when the amount varies', () => {
    const bills = [
      row({ occurredOn: '2026-09-11', amount: 18_000 }),
      row({ occurredOn: '2026-10-11', amount: 26_000 }),
    ];
    expect(seriesPayments(series({ amount: 26_000 }), bills)).toHaveLength(1);
    expect(seriesPayments(series({ amount: 26_000, amountVaries: true }), bills)).toHaveLength(2);
  });
});

describe('assignPayments', () => {
  it('recognizes an import as a payment of a series added by hand ("Spotify xyz")', () => {
    const spotify = series({
      id: 'spotify',
      pattern: suggestRecurringPattern('Spotify xyz'),
      amount: 3_290,
    });
    const imported = row({
      occurredOn: '2026-11-12',
      amount: 3_290,
      counterparty: 'SPOTIFY P46ED88101',
      description: 'SPOTIFY P46ED88101',
    });
    const other = row({ occurredOn: '2026-11-12' });
    const { payments, unowned } = assignPayments([spotify], [imported, other]);
    expect(payments.get('spotify')).toEqual([imported]);
    expect(unowned).toEqual([other]);
  });

  it('gives a transaction to the longest pattern, and keeps refused rows from detection', () => {
    const apple = series({ id: 'apple', pattern: 'apple', amount: 299 });
    const music = series({ id: 'music', pattern: 'apple music', amount: 1_490 });
    const tune = row({ occurredOn: '2026-10-01', counterparty: 'APPLE MUSIC', amount: 1_490 });
    const cloud = row({ occurredOn: '2026-10-02', counterparty: 'APPLE ICLOUD', amount: 299 });
    const laptop = row({ occurredOn: '2026-10-03', counterparty: 'APPLE STORE', amount: 650_000 });
    const { payments, unowned } = assignPayments([apple, music], [tune, cloud, laptop]);
    expect(payments.get('music')).toEqual([tune]);
    expect(payments.get('apple')).toEqual([cloud]);
    expect(unowned).toEqual([]);
  });
});

describe('detectRecurring', () => {
  const today = '2026-11-04';
  const detect = (input: RecurringRow[]) => detectRecurring(input, { today });

  it('finds a monthly subscription with its price rise', () => {
    const input = [
      ...rows(monthly('2026-04-07', 4)),
      ...rows(monthly('2026-08-07', 3), { amount: 4_990 }),
    ];
    const [netflix, ...rest] = detect(input);
    expect(rest).toEqual([]);
    expect(netflix).toMatchObject({
      key: 'netflix',
      scope: 'shared',
      ownerId: null,
      cadence: 'monthly',
      amount: 4_990,
      previousAmount: 4_990,
      amountVaries: true,
      firstOn: '2026-04-07',
      lastOn: '2026-10-07',
      occurrences: 7,
      monthlyAmount: 4_990,
    });
    expect(netflix?.transactionIds[0]).toBe(input.at(-1)?.id);
  });

  it('tolerates one missed month, not two in a row or two in one run', () => {
    const oneGap = rows(['2026-06-15', '2026-07-15', '2026-09-15', '2026-10-15']);
    expect(detect(oneGap)[0]?.occurrences).toBe(4);
    const twoInARow = rows(['2026-05-15', '2026-06-15', '2026-07-15', '2026-10-15']);
    expect(detect(twoInARow)).toEqual([]);
    const twoInOneRun = rows(['2026-03-15', '2026-05-15', '2026-07-15', '2026-08-15']);
    expect(detect(twoInOneRun)).toEqual([]);
  });

  it('needs three monthly or quarterly payments, four weekly ones, two yearly ones', () => {
    expect(detect(rows(['2026-09-07', '2026-10-07']))).toEqual([]);
    expect(detect(rows(['2026-08-07', '2026-09-07', '2026-10-07']))).toHaveLength(1);
    const weekly = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
    expect(detect(rows(weekly.slice(1), { counterparty: 'LIDL 0145' }))).toEqual([]);
    expect(detect(rows(weekly, { counterparty: 'LIDL 0145', amount: 12_000 }))[0]).toMatchObject({
      key: 'lidl',
      cadence: 'weekly',
      monthlyAmount: 52_000,
    });
    expect(
      detect(
        rows(['2025-11-05', '2026-11-01'], { counterparty: 'Domain renewal', amount: 5_000 }),
      )[0],
    ).toMatchObject({ cadence: 'yearly', occurrences: 2 });
    const quarters = ['2026-04-20', '2026-07-20', '2026-10-20'];
    expect(detect(rows(quarters.slice(1), { counterparty: 'Insurance' }))).toEqual([]);
    expect(detect(rows(quarters, { counterparty: 'Insurance' }))[0]?.cadence).toBe('quarterly');
  });

  it('turns down a weekly shop whose totals jump around', () => {
    const shop = [9_000, 15_500, 7_200, 12_800].map((amount, index) =>
      row({
        occurredOn: occurrence('2026-10-12', 'weekly', index),
        counterparty: 'TESCO 44049',
        amount,
      }),
    );
    expect(detect(shop)).toEqual([]);
  });

  it('drops a rhythm that stopped (cancelled) but keeps one a few days late', () => {
    const gym = rows(monthly('2026-01-03', 7), { counterparty: 'FITNESS PARK', amount: 14_900 });
    expect(gym.at(-1)?.occurredOn).toBe('2026-07-03');
    expect(detect(gym)).toEqual([]);
    const late = rows(monthly('2026-07-30', 3), { counterparty: 'TELEKOM', amount: 9_990 });
    expect(late.at(-1)?.occurredOn).toBe('2026-09-30');
    expect(daysBetween('2026-10-30', today)).toBe(5);
    expect(detect(late)).toHaveLength(1);
  });

  it('never mixes shared with private rows, or two people’s private rows', () => {
    const dates = monthly('2026-08-01', 3);
    const found = detect([
      ...rows(dates, { counterparty: 'BKK Automata', visibility: 'private', createdBy: ANNA }),
      ...rows(dates, { counterparty: 'BKK Automata', visibility: 'private', createdBy: BEN }),
      ...rows(dates, { counterparty: 'BKK Automata' }),
    ]);
    expect(found.map((s) => [s.scope, s.ownerId]).sort()).toEqual(
      [
        ['private', ANNA],
        ['private', BEN],
        ['shared', null],
      ].sort(),
    );
  });

  it('looks only at expenses and sorts the most expensive per month first', () => {
    const found = detect([
      ...rows(monthly('2026-08-05', 3), { kind: 'income', counterparty: 'ACME KFT', amount: 1 }),
      ...rows(monthly('2026-08-07', 3)),
      ...rows(monthly('2026-08-01', 3), { counterparty: 'Kovács Ingatlan Kft.', amount: 320_000 }),
    ]);
    expect(found.map((s) => s.key)).toEqual(['kovacs ingatlan kft.', 'netflix']);
  });
});

describe('schemas', () => {
  const input = {
    name: 'Spotify xyz',
    pattern: 'spotify',
    cadence: 'monthly',
    amount: 3_290,
    amountVaries: false,
    anchorOn: '2026-11-12',
    startsOn: null,
    categoryId: null,
    scope: 'shared',
    remind: true,
  };

  it('accepts a series and refuses a start after the anchor or an empty pattern', () => {
    expect(recurringSeriesInputSchema.safeParse(input).success).toBe(true);
    expect(
      recurringSeriesInputSchema.safeParse({ ...input, startsOn: '2026-12-01' }).error?.issues[0]
        ?.path,
    ).toEqual(['startsOn']);
    expect(recurringSeriesInputSchema.safeParse({ ...input, pattern: ' ** ' }).success).toBe(false);
    expect(updateRecurringSeriesInputSchema.safeParse({ remind: false }).success).toBe(true);
    expect(updateRecurringSeriesInputSchema.safeParse({ scope: 'private' }).data).toEqual({});
  });

  it('accepts only keys in match-key form', () => {
    expect(recurringKeySchema.safeParse('spotify').success).toBe(true);
    expect(recurringKeySchema.safeParse('Spotify').success).toBe(false);
    expect(recurringKeySchema.safeParse('kovacs  ingatlan').success).toBe(false);
  });
});
