import { runMigrations } from '../src/db/migrator';
import { TEST_DATABASE_URL } from './test-db';

// Runs once before all test files: bring the test database schema up to date.
export default async function setup() {
  await runMigrations(TEST_DATABASE_URL);
}
