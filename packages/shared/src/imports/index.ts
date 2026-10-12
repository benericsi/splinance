import { firstLine } from './csv';
import { looksLikeKh, parseKh } from './kh';
import { looksLikeRevolut, parseRevolut } from './revolut';
import { type ParsedStatement, type ParseOptions, StatementError } from './types';

export { decimalToMinor } from './amounts';
export { isOneOf, nameKey } from './names';
export * from './schemas';
export * from './types';

/**
 * Reads a bank export, recognizing the bank by its header row. Runs in the browser, so
 * the file itself never leaves the person's device; only the normalized rows are sent.
 */
export function parseStatement(text: string, options: ParseOptions = {}): ParsedStatement {
  const header = firstLine(text);
  if (looksLikeKh(header)) return parseKh(text, options);
  if (looksLikeRevolut(header)) return parseRevolut(text, options);
  throw new StatementError(
    'This file is not a Revolut or K&H export. Export the transaction history as CSV from your bank.',
  );
}
