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

/** Why a file cannot be read, as data, so the web can say it in the UI language. */
export type StatementProblem =
  | { code: 'not-supported' }
  | { code: 'empty' }
  | { code: 'missing-column'; bank: string; column: string }
  | { code: 'unreadable-amount'; value: string }
  | { code: 'unreadable-date'; value: string };

function describeProblem(problem: StatementProblem): string {
  switch (problem.code) {
    case 'not-supported':
      return 'This file is not a Revolut or K&H export. Export the transaction history as CSV from your bank.';
    case 'empty':
      return 'The file is empty';
    case 'missing-column':
      return `Not a ${problem.bank} export: no "${problem.column}" column`;
    case 'unreadable-amount':
      return `Unreadable amount "${problem.value}"`;
    case 'unreadable-date':
      return `Unreadable date "${problem.value}"`;
  }
}

/**
 * A file that is not a supported export, or a row that cannot be read. `message` is
 * English; `problem` and `line` are what a translated message is built from.
 */
export class StatementError extends Error {
  constructor(
    readonly problem: StatementProblem,
    readonly line?: number,
  ) {
    const message = describeProblem(problem);
    super(line === undefined ? message : `Line ${String(line)}: ${message}`);
    this.name = 'StatementError';
  }
}
