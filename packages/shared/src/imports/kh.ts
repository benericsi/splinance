import { decimalToMinor, shorten, tidy } from './amounts';
import { readDelimited } from './csv';
import { isOneOf } from './names';
import {
  type ParsedStatement,
  type ParseOptions,
  StatementError,
  type StatementFlag,
  type StatementRow,
} from './types';

/** Header names (K&H pads some with a trailing space), lowercased. */
const COLUMNS = {
  bookedOn: 'könyvelés dátuma',
  id: 'tranzakció azonosító',
  type: 'típus',
  holder: 'könyvelési számla elnevezése',
  party: 'partner elnevezése',
  amount: 'összeg',
  currency: 'összeg devizaneme',
  message: 'közlemény',
} as const;

type Column = keyof typeof COLUMNS;

export function looksLikeKh(header: string): boolean {
  const lower = header.toLowerCase();
  return header.includes('\t') && lower.includes(COLUMNS.id) && lower.includes(COLUMNS.bookedOn);
}

/** "2026.10.12" -> "2026-10-12". */
function fromDotted(value: string): string | undefined {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\.?$/.exec(value);
  return match ? `${match[1] ?? ''}-${match[2] ?? ''}-${match[3] ?? ''}` : undefined;
}

/**
 * K&H's transaction history export ("számlatörténet"): tab separated despite the .csv
 * name, one row per booking, newest first. Card purchases carry the purchase date in the
 * message ("Ref.: MSV… 2026/10/10 MERCHANT,HUN"), which is used instead of the booking
 * date. Card holds ("foglalás") are pending and have no usable id: the real booking comes
 * later. Fees are separate rows. Every booked row has a unique transaction id, which is
 * the fingerprint.
 */
export function parseKh(text: string, options: ParseOptions = {}): ParsedStatement {
  const [header, ...records] = readDelimited(text, '\t');
  if (!header) throw new StatementError('The file is empty');

  const names = header.cells.map((cell) => cell.trim().toLowerCase());
  const index = {} as Record<Column, number>;
  for (const column of Object.keys(COLUMNS) as Column[]) {
    const found = names.indexOf(COLUMNS[column]);
    if (found === -1) throw new StatementError(`Not a K&H export: no "${COLUMNS[column]}" column`);
    index[column] = found;
  }

  const cellOf = (cells: string[], column: Column) => (cells[index[column]] ?? '').trim();
  const accountHolder =
    records.map(({ cells }) => tidy(cellOf(cells, 'holder'))).find(Boolean) ?? null;
  // Holds have no currency; they are in the account's.
  const accountCurrency =
    records.map(({ cells }) => cellOf(cells, 'currency').toUpperCase()).find(Boolean) ?? 'HUF';
  const ownNames = [...(options.ownNames ?? []), ...(accountHolder ? [accountHolder] : [])];
  // Fees point at their transfer ("Tranz.ref.: BNK…"); its party names the fee.
  const partyById = new Map(
    records.map(({ cells }) => [cellOf(cells, 'id'), tidy(cellOf(cells, 'party'))]),
  );

  const rows: StatementRow[] = [];
  for (const { line, cells } of records) {
    const cell = (column: Column) => cellOf(cells, column);
    const type = tidy(cell('type'));
    const hold = /foglalás/i.test(type);
    const currency = cell('currency').toUpperCase() || accountCurrency;

    const amount = decimalToMinor(cell('amount'), currency);
    if (!amount) throw new StatementError(`Unreadable amount "${cell('amount')}"`, line);
    if (amount.minor === 0) continue;

    const bookedOn = fromDotted(cell('bookedOn'));
    if (!bookedOn) throw new StatementError(`Unreadable date "${cell('bookedOn')}"`, line);
    const message = tidy(cell('message'));
    const purchased = /\b(\d{4})\/(\d{2})\/(\d{2})\b/.exec(message);
    const occurredOn = purchased
      ? `${purchased[1] ?? ''}-${purchased[2] ?? ''}-${purchased[3] ?? ''}`
      : bookedOn;

    const party = tidy(cell('party')) || null;
    // A transfer's message is what the sender wrote; card messages are bank references.
    const note = message && !message.startsWith('Ref.:') ? message : '';
    const fee = /díj|költség/i.test(type);
    const feeFor = fee ? partyById.get(/Tranz\.ref\.:\s*(\S+)/.exec(message)?.[1] ?? '') : '';
    const description = party
      ? [party, note].filter(Boolean).join(' · ')
      : feeFor
        ? `Bank fee · ${feeFor}`
        : note || type;

    const flags: StatementFlag[] = [];
    if (hold) flags.push('pending');
    const toOwnRevolut = party !== null && /^revolut\b/i.test(party) && amount.minor < 0;
    if (toOwnRevolut || (party !== null && isOneOf(party, ownNames))) flags.push('own-transfer');
    if (/készpénzfelvét/i.test(type)) flags.push('cash-withdrawal');
    if (fee) flags.push('bank-fee');
    if (options.currency && currency !== options.currency) flags.push('other-currency');
    if (amount.rounded) flags.push('rounded');

    rows.push({
      line,
      fingerprint: hold ? null : `kh:${cell('id')}`,
      occurredOn,
      kind: amount.minor < 0 ? 'expense' : 'income',
      amount: Math.abs(amount.minor),
      currency,
      description: shorten(description),
      counterparty: party,
      flags,
    });
  }

  return { source: 'kh', accountHolder, rows };
}
