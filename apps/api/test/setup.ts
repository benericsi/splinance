import { afterAll } from 'vitest';
import { pool } from '../src/db/client';

// Release DB connections so the test worker can exit cleanly.
afterAll(async () => {
  await pool.end();
});
