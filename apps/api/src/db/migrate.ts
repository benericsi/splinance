import { env } from '../config/env';
import { logger } from '../lib/logger';
import { runMigrations } from './migrator';

try {
  await runMigrations(env.DATABASE_URL);
  logger.info('Migrations applied');
} catch (err) {
  logger.error({ err }, 'Migration failed');
  process.exitCode = 1;
}
