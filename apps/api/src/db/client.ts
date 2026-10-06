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

export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}
