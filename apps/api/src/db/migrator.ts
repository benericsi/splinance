import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import pg from 'pg';

// Resolved from the working directory (apps/api locally, app root in a container),
// so the same code works from src/ and from the bundled dist/.
export const MIGRATIONS_FOLDER = resolve('drizzle');

/** Applies pending migrations over a dedicated connection. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}
