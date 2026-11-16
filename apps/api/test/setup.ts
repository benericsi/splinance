import { afterAll, afterEach } from 'vitest';
import { pool } from '../src/db/client';
import { drainSyncs } from '../src/modules/notifications/sync';

// Routes start notification syncs without awaiting them: none may outlive its test (the
// next one resets the database).
afterEach(async () => {
  await drainSyncs();
});

// Release DB connections so the test worker can exit cleanly.
afterAll(async () => {
  await pool.end();
});
