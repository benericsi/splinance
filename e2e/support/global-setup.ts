import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { E2E_DATABASE_URL } from './env';

const API_DIR = fileURLToPath(new URL('../../apps/api', import.meta.url));

/**
 * Creates the e2e database on first use (the docker init script only runs on an empty
 * volume), applies migrations with the bundled migrate script and empties every table.
 */
export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!name.endsWith('_e2e')) {
    throw new Error(`E2E_DATABASE_URL must point at a *_e2e database, got "${name}"`);
  }

  await withClient(withDatabase(url, 'postgres'), async (client) => {
    const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  });

  // Same artifact production runs (dist/migrate.mjs), reading apps/api/drizzle.
  execFileSync(process.execPath, ['dist/migrate.mjs'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      DATABASE_URL: E2E_DATABASE_URL,
      JWT_ACCESS_SECRET: 'e2e-secret-that-is-at-least-32-characters',
    },
    stdio: 'inherit',
  });

  await withClient(E2E_DATABASE_URL, async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length === 0) return;
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  });
}

function withDatabase(url: URL, database: string): string {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}

async function withClient(
  connectionString: string,
  run: (client: pg.Client) => Promise<void>,
): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}
