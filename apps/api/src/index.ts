import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/client';
import { logger } from './lib/logger';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${String(env.PORT)}`);
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Shutting down');
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
