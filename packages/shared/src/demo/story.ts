import type { StatementSource } from '../imports';
import { addMonths, monthsBetween } from '../reports';
import { allocate, PERCENT_SCALE } from '../splits';
import type { TransactionKind } from '../transactions';
import { createRandom, type Random } from './random';

/**
 * The demo household's year, as data: what a couple in Budapest spent and earned over the
 * last 12 months, which bank each movement went through, and the settings (rules, budgets)
 * they made. Pure and deterministic: the same seed and day always give the same story, so
 * the seeded demo and the bank files the data track reads can be rebuilt at any time.
 * People are roles (`you`, `partner`), not user ids; the seeder maps them.
 */

/** Months of history, the current one included. */
export const DEMO_MONTHS = 12;

export type DemoPerson = 'you' | 'partner';

export interface DemoPersonInfo {
  displayName: string;
  /** The visitor banks with Revolut, the partner with K&H. */
  bank: StatementSource;
  /** The name as the bank writes it (K&H puts the family name first). */
  bankName: string;
}

export const DEMO_PEOPLE: Record<DemoPerson, DemoPersonInfo> = {
  you: { displayName: 'John Doe', bank: 'revolut', bankName: 'JOHN DOE' },
  partner: { displayName: 'Jane Doe', bank: 'kh', bankName: 'DOE JANE' },
};

export const DEMO_HOUSEHOLD_NAME = 'Doe household';

/** Splits name only the visitor's part; the partner gets the rest. */
export type DemoShare =
  | { visibility: 'private' }
  | {
      visibility: 'shared';
      split:
        | { method: 'equal' }
        | { method: 'percentage'; you: number }
        | { method: 'fixed'; you: number };
    };

export interface DemoTransaction {
  id: string;
  /** Who entered it: the payer of an expense, the receiver of an income. */
  person: DemoPerson;
  kind: TransactionKind;
  /** Forint (HUF has no minor digits). */
  amount: number;
  occurredOn: string;
  description: string;
  /** A name from `DEFAULT_CATEGORIES`, or null for none. */
  category: string | null;
  share: DemoShare;
  /** Imported from the person's bank export (one bank row refers to it), or typed in. */
  source: 'bank' | 'manual';
}

/** A payment between the two, recorded in the app and visible in both bank exports. */
export interface DemoSettlement {
  id: string;
  from: DemoPerson;
  to: DemoPerson;
  amount: number;
  settledOn: string;
  note: string;
}

export type DemoBankMove =
  'card' | 'transfer-in' | 'transfer-out' | 'direct-debit' | 'fee' | 'top-up' | 'atm';

/** One movement on a bank account, before it is written in the bank's export format. */
export interface DemoBankRow {
  id: string;
  /** Whose account: their bank is `DEMO_PEOPLE[person].bank`. */
  person: DemoPerson;
  occurredOn: string;
  /** `HH:MM:SS`, for exports that carry a time (Revolut). */
  time: string;
  move: DemoBankMove;
  /** Signed: negative is money leaving the account. */
  amount: number;
  /** The merchant or other party as the bank names it; null for top-ups and fees. */
  party: string | null;
  /** What the sender wrote on a transfer or direct debit. */
  note: string;
  /**
   * What the row is in the app: a transaction imported from it, a settlement (recorded by
   * hand, the row is left out of the import), or nothing (own transfers, cash withdrawals,
   * which the import leaves out by default).
   */
  ref: { transaction: string } | { settlement: string } | null;
}

export interface DemoRule {
  pattern: string;
  category: string;
  markShared: boolean;
}

export interface DemoBudget {
  category: string;
  /** `YYYY-MM`: in force from this month on. */
  from: string;
  amount: number;
}

export interface DemoStory {
  seed: number;
  /** The day the story ends on, `YYYY-MM-DD`; nothing happens after it. */
  today: string;
  /** `YYYY-MM`, oldest first, the current month last. */
  months: string[];
  householdName: string;
  people: Record<DemoPerson, DemoPersonInfo>;
  /** Sorted by date. */
  transactions: DemoTransaction[];
  settlements: DemoSettlement[];
  bankRows: DemoBankRow[];
  rules: DemoRule[];
  budgets: DemoBudget[];
}

const RENT = 320_000;
/** The visitor's part of the rent, in basis points. */
const RENT_SHARE_YOU = 6_000;
const EATING_OUT_BUDGET = 40_000;

/** A place with the names each bank prints for it. */
interface Place {
  name: string;
  revolut: string;
  kh: string;
}

const SHOPS: readonly Place[] = [
  { name: 'Tesco', revolut: 'Tesco', kh: 'TESCO GLOBAL ARUHAZAK' },
  { name: 'Lidl', revolut: 'Lidl', kh: 'LIDL 0145 BUDAPEST' },
  { name: 'Spar', revolut: 'Spar', kh: 'SPAR 1132' },
  { name: 'Aldi', revolut: 'Aldi', kh: 'ALDI 2016' },
  { name: 'Auchan', revolut: 'Auchan', kh: 'AUCHAN SOROKSAR' },
];

const RESTAURANTS: readonly Place[] = [
  { name: 'Wolt', revolut: 'Wolt', kh: 'WOLT.COM' },
  { name: 'Wolt', revolut: 'Wolt', kh: 'WOLT.COM' },
  { name: 'Pizza Mamma', revolut: 'Pizza Mamma', kh: 'PIZZA MAMMA KFT' },
  { name: 'Ramen Bar', revolut: 'Ramen Bar', kh: 'RAMEN BAR BUDAPEST' },
  { name: 'Bistro Nova', revolut: 'Bistro Nova', kh: 'BISTRO NOVA' },
];

/** Rossmann has no category on purpose: something for a new rule to pick up. */
const DRUGSTORES: readonly (Place & { category: string | null })[] = [
  { name: 'dm', revolut: 'dm', kh: 'DM 0412', category: 'Health' },
  { name: 'Pharmacy', revolut: 'Benu Gyogyszertar', kh: 'BENU GYOGYSZERTAR', category: 'Health' },
  { name: 'Rossmann', revolut: 'Rossmann', kh: 'ROSSMANN 211', category: null },
];

const SHOPPING: readonly Place[] = [
  { name: 'Decathlon', revolut: 'Decathlon', kh: 'DECATHLON BUDAPEST' },
  { name: 'H&M', revolut: 'H&M', kh: 'H&M 0937' },
  { name: 'Libri', revolut: 'Libri', kh: 'LIBRI ALLEE' },
];

const RULES: readonly DemoRule[] = [
  { pattern: 'tesco', category: 'Groceries', markShared: true },
  { pattern: 'lidl', category: 'Groceries', markShared: true },
  { pattern: 'wolt', category: 'Eating out', markShared: true },
  { pattern: 'netflix', category: 'Entertainment', markShared: true },
  { pattern: 'bkk', category: 'Transport', markShared: false },
];

const EQUAL: DemoShare = { visibility: 'shared', split: { method: 'equal' } };
const PRIVATE: DemoShare = { visibility: 'private' };

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export function daysInMonth(month: string): number {
  const [year = 1970, index = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Each person's part of a shared transaction (null when private); always sums to the amount. */
export function demoShares(
  transaction: Pick<DemoTransaction, 'amount' | 'share'>,
): Record<DemoPerson, number> | null {
  const { amount, share } = transaction;
  if (share.visibility === 'private') return null;
  const [you = 0, partner = 0] =
    share.split.method === 'equal'
      ? allocate(amount, [1, 1])
      : share.split.method === 'percentage'
        ? allocate(amount, [share.split.you, PERCENT_SCALE - share.split.you])
        : [share.split.you, amount - share.split.you];
  return { you, partner };
}

/**
 * What the visitor owes the partner (negative: the partner owes the visitor), from shared
 * transactions and settlements on or before `until`. The app may hand a leftover forint of
 * an odd equal split to the other person (it orders people by user id), so this can differ
 * from the app's balance by a forint per such transaction.
 */
export function demoBalance(
  story: Pick<DemoStory, 'transactions' | 'settlements'>,
  until = '9999-12-31',
): number {
  let youOwe = 0;
  for (const transaction of story.transactions) {
    const shares = demoShares(transaction);
    if (!shares || transaction.occurredOn > until) continue;
    const byPartner = transaction.person === 'partner';
    // An expense: the other person owes the payer their part. An income: the receiver
    // owes the other person theirs.
    if (transaction.kind === 'expense') youOwe += byPartner ? shares.you : -shares.partner;
    else youOwe += byPartner ? -shares.you : shares.partner;
  }
  for (const settlement of story.settlements) {
    if (settlement.settledOn > until) continue;
    youOwe += settlement.from === 'you' ? -settlement.amount : settlement.amount;
  }
  return youOwe;
}

interface BankDetail {
  move: DemoBankMove;
  party: string | null;
  note?: string;
}

class StoryBuilder {
  readonly transactions: DemoTransaction[] = [];
  readonly settlements: DemoSettlement[] = [];
  readonly bankRows: DemoBankRow[] = [];
  rng: Random = createRandom(0);

  private time(): string {
    return `${pad(this.rng.int(7, 21))}:${pad(this.rng.int(0, 59))}:${pad(this.rng.int(0, 59))}`;
  }

  private row(row: Omit<DemoBankRow, 'id' | 'time'>) {
    this.bankRows.push({
      id: `row-${pad(this.bankRows.length + 1, 4)}`,
      time: this.time(),
      ...row,
    });
  }

  add(transaction: Omit<DemoTransaction, 'id' | 'source'>, bank?: BankDetail) {
    const id = `tx-${pad(this.transactions.length + 1, 4)}`;
    this.transactions.push({ id, source: bank ? 'bank' : 'manual', ...transaction });
    if (bank) {
      const sign = transaction.kind === 'expense' ? -1 : 1;
      this.row({
        person: transaction.person,
        occurredOn: transaction.occurredOn,
        move: bank.move,
        amount: sign * transaction.amount,
        party: bank.party,
        note: bank.note ?? '',
        ref: { transaction: id },
      });
    }
  }

  /** A transfer between the two: recorded as a settlement, seen leaving one account and arriving on the other. */
  settle(settlement: Omit<DemoSettlement, 'id'>) {
    const id = `settlement-${pad(this.settlements.length + 1)}`;
    this.settlements.push({ id, ...settlement });
    const common = {
      occurredOn: settlement.settledOn,
      note: settlement.note,
      ref: { settlement: id },
    };
    this.row({
      ...common,
      person: settlement.from,
      move: 'transfer-out',
      amount: -settlement.amount,
      party: DEMO_PEOPLE[settlement.to].displayName,
    });
    this.row({
      ...common,
      person: settlement.to,
      move: 'transfer-in',
      amount: settlement.amount,
      party: DEMO_PEOPLE[settlement.from].displayName,
    });
  }

  /** A movement that is not spending: the import leaves it out. */
  bankOnly(row: Omit<DemoBankRow, 'id' | 'time' | 'ref' | 'note'>) {
    this.row({ ...row, note: '', ref: null });
  }
}

/** One month of the story; in the current month only what happened by `today`. */
function addMonth(
  b: StoryBuilder,
  { month, monthsAgo, today }: { month: string; monthsAgo: number; today: string },
) {
  const rng = b.rng;
  const length = daysInMonth(month);
  const isCurrent = today.startsWith(month);
  const lastDay = isCurrent ? Number(today.slice(8, 10)) : length;
  const date = (day: number) => `${month}-${pad(Math.min(day, length))}`;
  const happened = (day: number) => Math.min(day, length) <= lastDay;
  const anyDay = () => rng.int(1, lastDay);
  // A partial current month gets its share of the month's random purchases (at least one).
  const scaled = (count: number) =>
    isCurrent ? Math.max(1, Math.round((count * lastDay) / length)) : count;
  const place = (person: DemoPerson, where: Place) => (person === 'you' ? where.revolut : where.kh);
  const anyone = (): DemoPerson => (rng.chance(0.5) ? 'you' : 'partner');

  // Rent: the partner pays the landlord, the visitor's 60% comes back the next day.
  if (happened(1)) {
    b.add(
      {
        person: 'partner',
        kind: 'expense',
        amount: RENT,
        occurredOn: date(1),
        description: 'Rent',
        category: 'Housing',
        share: { visibility: 'shared', split: { method: 'percentage', you: RENT_SHARE_YOU } },
      },
      { move: 'transfer-out', party: 'Kovács Ingatlan Kft.', note: `Albérlet ${month}` },
    );
  }
  if (happened(2)) {
    const [rentShare = 0] = allocate(RENT, [RENT_SHARE_YOU, PERCENT_SCALE - RENT_SHARE_YOU]);
    b.settle({
      from: 'you',
      to: 'partner',
      amount: rentShare,
      settledOn: date(2),
      note: 'Rent share',
    });
  }

  // Monthly passes, salaries, subscriptions and bills.
  if (happened(1)) {
    for (const person of ['you', 'partner'] as const) {
      b.add(
        {
          person,
          kind: 'expense',
          amount: 8_950,
          occurredOn: date(1),
          description: 'BKK monthly pass',
          category: 'Transport',
          share: PRIVATE,
        },
        { move: 'card', party: person === 'you' ? 'BKK Automata' : 'BKK ONLINE' },
      );
    }
  }
  if (happened(2)) {
    b.bankOnly({ person: 'you', occurredOn: date(2), move: 'top-up', amount: 40_000, party: null });
  }
  if (happened(5)) {
    b.add(
      {
        person: 'partner',
        kind: 'income',
        amount: 610_000,
        occurredOn: date(5),
        description: 'Salary',
        category: 'Salary',
        share: PRIVATE,
      },
      { move: 'transfer-in', party: 'Globex Zrt.', note: `Bér ${addMonths(month, -1)}` },
    );
  }
  if (happened(7)) {
    b.add(
      {
        person: 'you',
        kind: 'expense',
        amount: 4_490,
        occurredOn: date(7),
        description: 'Netflix',
        category: 'Entertainment',
        share: EQUAL,
      },
      { move: 'card', party: 'Netflix.com' },
    );
  }
  if (happened(10)) {
    b.add(
      {
        person: 'you',
        kind: 'income',
        amount: 690_000,
        occurredOn: date(10),
        description: 'Salary',
        category: 'Salary',
        share: PRIVATE,
      },
      { move: 'transfer-in', party: 'ACME KFT' },
    );
    // Straight on to savings at another bank: a transfer to self, not spending.
    b.bankOnly({
      person: 'you',
      occurredOn: date(10),
      move: 'transfer-out',
      amount: -300_000,
      party: DEMO_PEOPLE.you.displayName,
    });
  }
  if (happened(11)) {
    const winter = ['11', '12', '01', '02', '03'].includes(month.slice(5));
    b.add(
      {
        person: 'partner',
        kind: 'expense',
        amount: (winter ? rng.int(340, 420) : rng.int(160, 220)) * 100,
        occurredOn: date(11),
        description: 'Electricity and gas',
        category: 'Utilities',
        share: EQUAL,
      },
      {
        move: 'direct-debit',
        party: 'MVM Next Energiakereskedelmi Zrt.',
        note: 'Ügyfélazonosító: 3000123456',
      },
    );
  }
  // Spotify joined half a year ago (and the entertainment budget went up with it).
  if (monthsAgo <= 5 && happened(12)) {
    b.add(
      {
        person: 'partner',
        kind: 'expense',
        amount: 3_290,
        occurredOn: date(12),
        description: 'Spotify Duo',
        category: 'Entertainment',
        share: EQUAL,
      },
      { move: 'card', party: 'SPOTIFY' },
    );
  }
  if (happened(15)) {
    b.add(
      {
        person: 'you',
        kind: 'expense',
        amount: 9_990,
        occurredOn: date(15),
        description: 'Internet',
        category: 'Utilities',
        share: EQUAL,
      },
      { move: 'card', party: 'Telekom' },
    );
  }

  // Every other month the partner takes out cash and spends some of it at the market.
  if (monthsAgo % 2 === 1) {
    const day = rng.int(14, 20);
    if (happened(day)) {
      b.bankOnly({
        person: 'partner',
        occurredOn: date(day),
        move: 'atm',
        amount: -20_000,
        party: 'K&H ATM CORVIN',
      });
      b.add({
        person: 'partner',
        kind: 'expense',
        amount: rng.int(60, 120) * 100,
        occurredOn: date(day),
        description: 'Farmers market',
        category: 'Groceries',
        share: EQUAL,
      });
    }
  }

  // Everyday spending on random days.
  for (let i = scaled(rng.int(6, 9)); i > 0; i--) {
    const person = anyone();
    const shop = rng.pick(SHOPS);
    b.add(
      {
        person,
        kind: 'expense',
        amount: rng.int(400, 2_400) * 10,
        occurredOn: date(anyDay()),
        description: shop.name,
        category: 'Groceries',
        share: rng.chance(0.85) ? EQUAL : PRIVATE,
      },
      { move: 'card', party: place(person, shop) },
    );
  }

  // Eating out. This month it is kept between 85% and 93% of the budget whatever the day,
  // so the budget alert on the overview always has something to show.
  const meals = isCurrent
    ? allocate(
        Math.round((EATING_OUT_BUDGET * rng.int(85, 93)) / 1_000) * 10,
        Array.from({ length: Math.min(4, Math.ceil(lastDay / 8)) }, () => rng.int(20, 50)),
      )
    : Array.from({ length: rng.int(3, 5) }, () => rng.int(450, 1_800) * 10);
  for (const amount of meals) {
    const person = anyone();
    const restaurant = rng.pick(RESTAURANTS);
    b.add(
      {
        person,
        kind: 'expense',
        amount,
        occurredOn: date(anyDay()),
        description: restaurant.name,
        category: 'Eating out',
        share: isCurrent || rng.chance(0.8) ? EQUAL : PRIVATE,
      },
      { move: 'card', party: place(person, restaurant) },
    );
  }

  for (let i = isCurrent ? rng.int(0, 1) : rng.int(0, 2); i > 0; i--) {
    const person = anyone();
    const store = rng.pick(DRUGSTORES);
    b.add(
      {
        person,
        kind: 'expense',
        amount: rng.int(150, 900) * 10,
        occurredOn: date(anyDay()),
        description: store.name,
        category: store.category,
        share: PRIVATE,
      },
      { move: 'card', party: place(person, store) },
    );
  }
  if (rng.chance(0.5)) {
    const person = anyone();
    const shop = rng.pick(SHOPPING);
    b.add(
      {
        person,
        kind: 'expense',
        amount: rng.int(600, 2_500) * 10,
        occurredOn: date(anyDay()),
        description: shop.name,
        category: 'Shopping',
        share: PRIVATE,
      },
      { move: 'card', party: place(person, shop) },
    );
  }

  // One-offs, counted back from the current month.
  if (monthsAgo === 8) {
    b.add(
      {
        person: 'you',
        kind: 'expense',
        amount: 46_990,
        occurredOn: date(9),
        description: 'IKEA: shelves and lamps',
        category: 'Shopping',
        share: EQUAL,
      },
      { move: 'card', party: 'IKEA Budaors' },
    );
  }
  if (monthsAgo === 6) {
    b.add({
      person: 'partner',
      kind: 'income',
      amount: 35_000,
      occurredOn: date(18),
      description: 'Sold the old bike',
      category: 'Other income',
      share: PRIVATE,
    });
  }
  if (monthsAgo === 4) {
    b.add(
      {
        person: 'you',
        kind: 'expense',
        amount: 68_400,
        occurredOn: date(3),
        description: 'Flights to Lisbon',
        category: 'Travel',
        share: EQUAL,
      },
      { move: 'card', party: 'Wizz Air' },
    );
    // The bigger room was the visitor's wish, so they pay more of it.
    b.add(
      {
        person: 'you',
        kind: 'expense',
        amount: 184_000,
        occurredOn: date(4),
        description: 'Lisbon apartment',
        category: 'Travel',
        share: { visibility: 'shared', split: { method: 'fixed', you: 100_000 } },
      },
      { move: 'card', party: 'Airbnb' },
    );
  }
  if (monthsAgo === 2) {
    b.add({
      person: 'you',
      kind: 'expense',
      amount: 15_000,
      occurredOn: date(20),
      description: 'Birthday present for Mum',
      category: 'Other',
      share: PRIVATE,
    });
  }

  // K&H charges its account fee on the last day.
  if (happened(length)) {
    b.add(
      {
        person: 'partner',
        kind: 'expense',
        amount: 1_290,
        occurredOn: date(length),
        description: 'Account fee',
        category: 'Other',
        share: PRIVATE,
      },
      { move: 'fee', party: null },
    );
  }

  // Every three months they settle what built up, in round thousands; the last three
  // months stay open, so the overview has a balance to show.
  if (monthsAgo === 9 || monthsAgo === 6 || monthsAgo === 3) {
    const owed = demoBalance(b, date(28));
    const amount = Math.floor(Math.abs(owed) / 1_000) * 1_000;
    if (amount > 0) {
      b.settle({
        from: owed > 0 ? 'you' : 'partner',
        to: owed > 0 ? 'partner' : 'you',
        amount,
        settledOn: date(28),
        note: 'Settling up',
      });
    }
  }
}

const byDate =
  <T extends { id: string }>(dateOf: (item: T) => string) =>
  (a: T, b: T) =>
    dateOf(a).localeCompare(dateOf(b)) || a.id.localeCompare(b.id);

/**
 * Builds the demo story for the 12 months ending on `today` (`YYYY-MM-DD`). `seed` (an
 * unsigned 32-bit integer) varies amounts, days and shops; the storyline stays the same.
 */
export function buildDemoStory({ seed, today }: { seed: number; today: string }): DemoStory {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('buildDemoStory: seed must be an unsigned 32-bit integer');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || addDays(today, 0) !== today) {
    throw new RangeError('buildDemoStory: today must be a YYYY-MM-DD date');
  }

  const current = today.slice(0, 7);
  const months = monthsBetween(addMonths(current, 1 - DEMO_MONTHS), current);
  const builder = new StoryBuilder();
  months.forEach((month, index) => {
    // Each month draws from its own stream, so one month's draws never shift another's.
    builder.rng = createRandom((seed + Math.imul(index + 1, 0x9e37_79b1)) >>> 0);
    addMonth(builder, { month, monthsAgo: months.length - 1 - index, today });
  });

  const first = months[0] ?? current;
  return {
    seed,
    today,
    months,
    householdName: DEMO_HOUSEHOLD_NAME,
    people: DEMO_PEOPLE,
    transactions: builder.transactions.sort(byDate((t) => t.occurredOn)),
    settlements: builder.settlements.sort(byDate((s) => s.settledOn)),
    bankRows: builder.bankRows.sort(byDate((r) => `${r.occurredOn} ${r.time}`)),
    rules: [...RULES],
    budgets: [
      { category: 'Groceries', from: first, amount: 120_000 },
      { category: 'Eating out', from: first, amount: EATING_OUT_BUDGET },
      { category: 'Entertainment', from: first, amount: 6_000 },
      // Raised when Spotify joined Netflix.
      { category: 'Entertainment', from: addMonths(current, -5), amount: 10_000 },
    ],
  };
}
