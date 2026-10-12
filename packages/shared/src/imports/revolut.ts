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

/** Revolut writes its export in the app's language; these two are the ones seen so far. */
const COLUMNS = {
  type: ['Típus', 'Type'],
  product: ['Termék', 'Product'],
  started: ['Kezdés dátuma', 'Started Date'],
  description: ['Leírás', 'Description'],
  amount: ['Összeg', 'Amount'],
  fee: ['Díj', 'Fee'],
  currency: ['Pénznem', 'Currency'],
  state: ['State', 'Állapot'],
} as const;

type Column = keyof typeof COLUMNS;

const COMPLETED = new Set(['ELVÉGEZVE', 'COMPLETED']);
/** Never happened: left out entirely rather than flagged. */
const CANCELLED = new Set(['REVERTED', 'DECLINED', 'FAILED', 'VISSZAVONVA', 'ELUTASÍTVA']);

/** "Átutalás tőle: X", "Transfer to X", "Fizetés a következő személytől: X" -> X. */
const PARTY =
  /^(?:átutalás (?:tőle|neki|ide)|fizetés a következő személytől|transfer (?:from|to)|payment from|to|from)\s*:?\s+(.+)$/i;

export function looksLikeRevolut(header: string): boolean {
  return (
    COLUMNS.started.some((name) => header.includes(name)) &&
    COLUMNS.currency.some((name) => header.includes(name))
  );
}

/**
 * Revolut's account statement CSV (comma separated, one row per movement, amounts with a
 * decimal point, negative for money going out). The date is when the payment started
 * (what receipts say), not when it completed. Fees in the Fee column are added to the
 * amount. Rows have no id, so the fingerprint is the product, start time, amount and
 * description, plus a counter for exact repeats (two identical coffees in one second).
 */
export function parseRevolut(text: string, options: ParseOptions = {}): ParsedStatement {
  const [header, ...records] = readDelimited(text, ',');
  if (!header) throw new StatementError('The file is empty');

  const index = {} as Record<Column, number>;
  for (const column of Object.keys(COLUMNS) as Column[]) {
    const found = header.cells.findIndex((cell) =>
      (COLUMNS[column] as readonly string[]).includes(cell.trim()),
    );
    if (found === -1) {
      throw new StatementError(`Not a Revolut export: no "${COLUMNS[column][1]}" column`);
    }
    index[column] = found;
  }

  const ownNames = options.ownNames ?? [];
  const seen = new Map<string, number>();
  const rows: StatementRow[] = [];

  for (const { line, cells } of records) {
    const cell = (column: Column) => (cells[index[column]] ?? '').trim();
    const state = cell('state').toUpperCase();
    if (CANCELLED.has(state)) continue;

    const currency = cell('currency').toUpperCase();
    const amount = decimalToMinor(cell('amount'), currency);
    const fee = decimalToMinor(cell('fee') || '0', currency);
    if (!amount || !fee) throw new StatementError(`Unreadable amount "${cell('amount')}"`, line);
    // Fees are charged on top: they make an expense larger and an income smaller.
    const total = amount.minor - fee.minor;
    if (total === 0) continue;

    const started = cell('started');
    const occurredOn = started.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      throw new StatementError(`Unreadable date "${started}"`, line);
    }

    const type = cell('type');
    const description = tidy(cell('description'));
    const party = PARTY.exec(description)?.[1]?.trim();

    const flags: StatementFlag[] = [];
    if (!COMPLETED.has(state)) flags.push('pending');
    // Top-ups from one of the person's own cards name it by its last digits ("*4662").
    const cardTopUp = /^(feltöltés|top-?up)$/i.test(type) && /\*\d{4}/.test(description);
    if (cardTopUp || (party !== undefined && isOneOf(party, ownNames))) flags.push('own-transfer');
    if (/atm|készpénz|cash/i.test(type)) flags.push('cash-withdrawal');
    if (/^(díj|fee|charge)$/i.test(type)) flags.push('bank-fee');
    if (options.currency && currency !== options.currency) flags.push('other-currency');
    if (amount.rounded || fee.rounded) flags.push('rounded');

    const key = `revolut:${cell('product')}|${started}|${cell('amount')}|${description}`;
    const repeat = seen.get(key) ?? 0;
    seen.set(key, repeat + 1);

    rows.push({
      line,
      fingerprint: `${key}#${String(repeat)}`,
      occurredOn,
      kind: total < 0 ? 'expense' : 'income',
      amount: Math.abs(total),
      currency,
      description: shorten(description || type),
      counterparty: party ?? (description || null),
      flags,
    });
  }

  return { source: 'revolut', accountHolder: null, rows };
}
