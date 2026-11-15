import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './keyset-cursor';
import { HttpError } from './http-error';

const ID = '019a0000-0000-7000-8000-000000000001';
const raw = (text: string) => Buffer.from(text).toString('base64url');

function rejects(cursor: string) {
  try {
    decodeCursor(cursor);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
    return;
  }
  throw new Error(`accepted ${cursor}`);
}

describe('decodeCursor', () => {
  it('reads back what encodeCursor made', () => {
    expect(decodeCursor(encodeCursor({ date: '2026-10-03', id: ID }))).toEqual({
      date: '2026-10-03',
      id: ID,
    });
  });

  it('refuses anything else with a 400, before it can reach Postgres', () => {
    rejects('not base64 at all');
    rejects(raw(`2026-10-03|${ID}|x`));
    // The right shape, but no such day or no such id.
    rejects(raw(`2026-99-99|${ID}`));
    rejects(raw(`2026-02-30|${ID}`));
    rejects(raw(`2026-10-03|${'-'.repeat(36)}`));
  });
});
