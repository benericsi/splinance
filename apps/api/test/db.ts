import { pool } from '../src/db/client';

/**
 * Empties every table in the public schema (migrations live in the "drizzle" schema).
 * Refuses to run against anything but a *_test database.
 */
export async function resetDatabase(): Promise<void> {
  const { rows: dbRows } = await pool.query<{ name: string }>('select current_database() as name');
  const name = dbRows[0]?.name ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(`resetDatabase refused to run against "${name}"`);
  }

  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;

  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
