import type { TransactionKind } from '../transactions';

export const STATEMENT_SOURCES = ['revolut', 'kh'] as const;
export type StatementSource = (typeof STATEMENT_SOURCES)[number];

export const STATEMENT_SOURCE_LABELS: Record<StatementSource, string> = {
  revolut: 'Revolut',
  kh: 'K&H',
};

/**
 * Why a row needs a second look. Rows flagged `pending`, `own-transfer`, `cash-withdrawal`
 * or `other-currency` are left out of an import unless the person picks them; the others
 * are informational.
 */
export const STATEMENT_FLAGS = [
  /** Not final yet (a card hold, a pending payment): it comes back later as a real row. */
  'pending',
  /** Money moved between the person's own accounts (a Revolut top-up, a transfer to self). */
  'own-transfer',
  /** Cash taken out: not spending yet. */
  'cash-withdrawal',
  /** A bank fee or charge, imported as its own small expense. */
  'bank-fee',
  /** Not in the household's currency. */
  'other-currency',
  /** Had fractions of the currency's smallest unit (HUF fillér), rounded to whole units. */
  'rounded',
] as const;
export type StatementFlag = (typeof STATEMENT_FLAGS)[number];

/** Left out of an import by default (the person can still pick them, except pending). */
export const EXCLUDED_BY_DEFAULT: readonly StatementFlag[] = [
  'pending',
  'own-transfer',
  'cash-withdrawal',
  'other-currency',
];

/** One movement from a bank export, normalized. */
export interface StatementRow {
  /** Line in the file, for messages. */
  line: number;
  /**
   * Stable across exports of the same account: the bank's own transaction id when there
   * is one, else built from the row (see each parser). Null for rows that cannot be
   * identified (card holds), which are never imported.
   */
  fingerprint: string | null;
  /** When it happened (the purchase date, not when the bank booked it), `YYYY-MM-DD`. */
  occurredOn: string;
  kind: TransactionKind;
  /** Positive, in the minor units of `currency`. */
  amount: number;
  /** ISO code as the bank wrote it; may be one the app does not support. */
  currency: string;
  /** A starting description, at most 120 characters (editable before importing). */
  description: string;
  /** The merchant or other party exactly as the bank named it, if any. */
  counterparty: string | null;
  flags: StatementFlag[];
}

export interface ParsedStatement {
  source: StatementSource;
  /** The account holder's name when the file says it (K&H), to recognize own transfers. */
  accountHolder: string | null;
  rows: StatementRow[];
}

export interface ParseOptions {
  /**
   * Names the person goes by on their bank accounts. Transfers from or to these names are
   * between their own accounts. The account holder of the file is always included.
   */
  ownNames?: readonly string[];
  /** The household's currency: rows in any other are flagged `other-currency`. */
  currency?: string;
}

/** A file that is not a supported export, or a row that cannot be read. */
export class StatementError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `Line ${String(line)}: ${message}`);
    this.name = 'StatementError';
  }
}
