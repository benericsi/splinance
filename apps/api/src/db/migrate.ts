import { env } from '../config/env';
import { logger } from '../lib/logger';
import { runMigrations } from './migrator';

try {
  // As the schema owner when one is configured: the API's own role cannot change the schema.
  await runMigrations(env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL);
  logger.info('Migrations applied');
} catch (err) {
  logger.error({ err }, 'Migration failed');
  process.exitCode = 1;
}
