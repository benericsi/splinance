import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as schema from './schema';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
});

// Without a listener, an error on an idle client (e.g. DB restart) crashes the process.
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle Postgres client');
});

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });

/** A transaction handle; services accept `Db` so they work inside or outside a transaction. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Db = typeof db | Tx;

export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
