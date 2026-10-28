import type { ParseOptions, StatementSource } from '../imports';
import {
  addDays,
  DEMO_PEOPLE,
  type DemoBankMove,
  type DemoBankRow,
  type DemoPerson,
  type DemoStory,
} from './story';

/**
 * The demo story's bank movements written as the banks export them: one Revolut file per
 * month for the visitor, one K&H file per month for the partner. The seeder imports these
 * through `parseStatement` like a person would, and the data track gets the very same
 * files, so app data and bank files reconcile.
 */
export interface DemoBankFile {
  source: StatementSource;
  person: DemoPerson;
  /** `YYYY-MM`: Revolut files go by start date, K&H files by booking date. */
  month: string;
  fileName: string;
  text: string;
  /** The story row on each line, by the 1-based line number `parseStatement` reports. */
  lines: { line: number; rowId: string }[];
}

/** What a person tells the import page: their name at the bank and the household currency. */
export function demoParseOptions(person: DemoPerson): ParseOptions {
  return { ownNames: [DEMO_PEOPLE[person].displayName], currency: 'HUF' };
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');

// Revolut: comma separated, English column names, oldest first, amounts with two decimals.

const REVOLUT_HEADER =
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
const REVOLUT_OPENING_BALANCE = 120_000;
const CARD_DIGITS = '4821';

const REVOLUT_TYPES: Record<DemoBankMove, string> = {
  card: 'Card Payment',
  'direct-debit': 'Card Payment',
  'transfer-in': 'Transfer',
  'transfer-out': 'Transfer',
  fee: 'Fee',
  'top-up': 'Topup',
  atm: 'ATM',
};

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const revolutAmount = (amount: number) => `${amount < 0 ? '-' : ''}${String(Math.abs(amount))}.00`;

function revolutDescription(row: DemoBankRow): string {
  switch (row.move) {
    case 'transfer-in':
      return `Transfer from ${row.party ?? ''}`;
    case 'transfer-out':
      return `Transfer to ${row.party ?? ''}`;
    case 'top-up':
      return `Top-up by *${CARD_DIGITS}`;
    default:
      return row.party ?? REVOLUT_TYPES[row.move];
  }
}

function renderRevolut(rows: readonly { row: DemoBankRow; balance: number }[]): string {
  const lines = rows.map(({ row, balance }) => {
    const started = `${row.occurredOn} ${row.time}`;
    return [
      REVOLUT_TYPES[row.move],
      'Current',
      started,
      started,
      revolutDescription(row),
      revolutAmount(row.amount),
      '0.00',
      'HUF',
      'COMPLETED',
      revolutAmount(balance),
    ]
      .map(csvCell)
      .join(',');
  });
  return `${[REVOLUT_HEADER, ...lines].join('\n')}\n`;
}

// K&H: tab separated, Hungarian column names, newest first, whole forints.

const KH_HEADER = [
  'könyvelés dátuma',
  'tranzakció azonosító ',
  'típus',
  'könyvelési számla',
  'könyvelési számla elnevezése',
  'partner számla',
  'partner elnevezése',
  'összeg',
  'összeg devizaneme',
  'közlemény',
  'tranzakciót indító tényleges fizető fél neve ',
].join('\t');
const KH_ACCOUNT = '10400000-50000000-12345678';

const KH_TYPES: Record<DemoBankMove, string> = {
  card: 'Vásárlás belföldi kereskedőnél',
  'direct-debit': 'Csoportos beszedési megbízás terhelése',
  'transfer-in': 'Azonnali Forint átutalás jóváírás',
  'transfer-out': 'Azonnali Forint átutalás bankon kívül',
  fee: 'Számlavezetési díj',
  'top-up': 'Jóváírás',
  atm: 'Készpénzfelvét K&H ATM-ből',
};

interface KhRow {
  row: DemoBankRow;
  bookedOn: string;
  /** Position in booking order, for ids that never repeat. */
  sequence: number;
}

/** Cards and ATMs are booked the next day (today at the latest); the rest the same day. */
function khBookedOn(row: DemoBankRow, today: string): string {
  if (row.move !== 'card' && row.move !== 'atm') return row.occurredOn;
  const next = addDays(row.occurredOn, 1);
  return next > today ? today : next;
}

function khCells({ row, bookedOn, sequence }: KhRow): string[] {
  const [year = '', month = '', day = ''] = bookedOn.split('-');
  const short = `${year.slice(2)}${month}${day}`;
  const holder = DEMO_PEOPLE[row.person].bankName;
  const amount = Math.abs(row.amount);
  const card = row.move === 'card' || row.move === 'atm';
  const transfer =
    row.move === 'transfer-in' || row.move === 'transfer-out' || row.move === 'direct-debit';

  const id = card
    ? `${row.move === 'atm' ? 'MSK' : 'MSV'}${String(sequence)}.SAO-${month}-${day}-${year}${pad(sequence, 12)}-1`
    : `${transfer ? 'BNK' : 'AAACT'}${short}${pad(sequence, 8)}`;
  // Card messages carry the purchase date, which the parser uses instead of the booking date.
  const message = card
    ? `Ref.: ${id.slice(0, 3)}${pad(sequence, 13)} 544537******${CARD_DIGITS} ${holder} ${String(amount)} HUF ${String(amount)} HUF ${row.occurredOn.replace(/-/g, '/')} ${row.party ?? ''},HUN`
    : transfer
      ? row.note
      : `Ref.: ${id}`;

  return [
    `${year}.${month}.${day}`,
    id,
    KH_TYPES[row.move],
    KH_ACCOUNT,
    holder,
    transfer ? `HU42${pad(sequence, 24)}` : '',
    row.party ?? '',
    String(row.amount),
    'HUF',
    message,
    '',
  ];
}

function renderKh(rows: readonly KhRow[]): string {
  const lines = rows.map((row) => {
    const cells = khCells(row);
    if (cells.some((cell) => /[\t\r\n]/.test(cell))) {
      throw new Error(`K&H rows cannot hold tabs or line breaks: ${row.row.id}`);
    }
    return cells.join('\t');
  });
  return `${[KH_HEADER, ...lines].join('\r\n')}\r\n`;
}

function groupByMonth<T>(items: readonly T[], monthOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const month = monthOf(item);
    groups.set(month, [...(groups.get(month) ?? []), item]);
  }
  return groups;
}

/** Every monthly export of both people, oldest month first (K&H before Revolut within a month). */
export function renderDemoBankFiles(story: DemoStory): DemoBankFile[] {
  const files: DemoBankFile[] = [];
  const linesOf = (rows: readonly { row: DemoBankRow }[]) =>
    rows.map(({ row }, index) => ({ line: index + 2, rowId: row.id }));

  for (const person of ['you', 'partner'] as const) {
    const source = story.people[person].bank;
    const own = story.bankRows.filter((row) => row.person === person);

    if (source === 'revolut') {
      // The Balance column runs on across the monthly files.
      let balance = REVOLUT_OPENING_BALANCE;
      const withBalance = own.map((row) => {
        balance += row.amount;
        return { row, balance };
      });
      for (const [month, rows] of groupByMonth(withBalance, ({ row }) =>
        row.occurredOn.slice(0, 7),
      )) {
        files.push({
          source,
          person,
          month,
          fileName: `revolut-${month}.csv`,
          text: renderRevolut(rows),
          lines: linesOf(rows),
        });
      }
    } else {
      const booked = own
        .map((row) => ({ row, bookedOn: khBookedOn(row, story.today) }))
        .sort(
          (a, b) =>
            a.bookedOn.localeCompare(b.bookedOn) ||
            `${a.row.occurredOn} ${a.row.time}`.localeCompare(`${b.row.occurredOn} ${b.row.time}`),
        )
        .map((row, index) => ({ ...row, sequence: index + 1 }));
      for (const [month, rows] of groupByMonth(booked, (row) => row.bookedOn.slice(0, 7))) {
        const newestFirst = rows.toReversed();
        files.push({
          source,
          person,
          month,
          fileName: `kh-${month}.csv`,
          text: renderKh(newestFirst),
          lines: linesOf(newestFirst),
        });
      }
    }
  }

  return files.sort((a, b) => a.month.localeCompare(b.month) || a.source.localeCompare(b.source));
}
