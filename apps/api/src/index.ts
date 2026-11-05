import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/client';
import { logger } from './lib/logger';
import { startDemoCleanup } from './modules/demo/demo.cleanup';
import { startMaintenance } from './modules/maintenance/maintenance.service';
import { startNotificationSweep } from './modules/notifications/sync';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${String(env.PORT)}`);
});

// Only the demo instance has sandboxes to expire; both delete stale sessions and invites.
const stopDemoCleanup = env.DEMO_MODE ? startDemoCleanup() : undefined;
const stopMaintenance = startMaintenance();
// Renewals coming near and budgets: what changes with the date alone, not with a write.
const stopNotificationSweep = startNotificationSweep();

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Shutting down');
  stopDemoCleanup?.();
  stopMaintenance();
  stopNotificationSweep();
  // Stop accepting requests first, then release DB connections.
  server.close((serverErr) => {
    pool
      .end()
      .catch((err: unknown) => {
        logger.error({ err }, 'Error closing Postgres pool');
      })
      .finally(() => {
        if (serverErr) logger.error({ err: serverErr }, 'Error closing HTTP server');
        process.exit(serverErr ? 1 : 0);
      });
  });
  // Force exit if open connections keep the server alive.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
