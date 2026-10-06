import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** uuidv7 (Postgres 18+): time-ordered for index locality, not enumerable like serial ids. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

export const createdAt = () => timestamptz().notNull().defaultNow();

export const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
