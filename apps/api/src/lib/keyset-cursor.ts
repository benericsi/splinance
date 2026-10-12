import { HttpError } from './http-error';

/**
 * The position after the last row of a page in a list ordered by (date desc, id desc):
 * that row's date and id, base64url encoded. Opaque to clients.
 */
export interface KeysetPosition {
  date: string;
  id: string;
}

const invalidCursor = () => new HttpError(400, 'Invalid cursor', 'VALIDATION_ERROR');

export function encodeCursor({ date, id }: KeysetPosition): string {
  return Buffer.from(`${date}|${id}`).toString('base64url');
}

/** Throws 400 for anything that is not a cursor this API made. */
export function decodeCursor(cursor: string): KeysetPosition {
  const match = /^(\d{4}-\d{2}-\d{2})\|([0-9a-f-]{36})$/.exec(
    Buffer.from(cursor, 'base64url').toString(),
  );
  if (!match?.[1] || !match[2]) throw invalidCursor();
  return { date: match[1], id: match[2] };
}
