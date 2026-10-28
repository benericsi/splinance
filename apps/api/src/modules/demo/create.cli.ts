import { parseArgs } from 'node:util';
import { env } from '../../config/env';
import { pool } from '../../db/client';
import { logger } from '../../lib/logger';
import { createSandbox } from './demo.service';

/**
 * Creates a sandbox on the configured (demo) database without signing anyone in: a
 * long-lived showcase household for the data track (`--days 3650`), or one to inspect.
 * Its bank files come from `demo:bank-files` with the printed seed and day.
 *
 *   pnpm --filter @splinance/api demo:create [--seed <n>] [--today <YYYY-MM-DD>] [--days <n>]
 */

const USAGE =
  'Usage: pnpm --filter @splinance/api demo:create [--seed <n>] [--today <YYYY-MM-DD>] [--days <n>]';

try {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string' },
      today: { type: 'string' },
      days: { type: 'string' },
    },
  });
  const days = values.days === undefined ? env.DEMO_TTL_DAYS : Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 36_500) throw new Error(USAGE);

  const sandbox = await createSandbox(
    { ttlDays: days, maxActive: env.DEMO_MAX_ACTIVE },
    {
      ...(values.seed !== undefined && { seed: Number(values.seed) }),
      ...(values.today !== undefined && { today: values.today }),
    },
  );
  process.stdout.write(
    [
      `Demo ${sandbox.demoId}`,
      `  household ${sandbox.householdId}`,
      `  seed ${String(sandbox.seed)}, story until ${sandbox.today}`,
      `  expires ${sandbox.expiresAt.toISOString()}`,
      `  bank files: pnpm --filter @splinance/api demo:bank-files --out <dir> --seed ${String(sandbox.seed)} --today ${sandbox.today}`,
      '',
    ].join('\n'),
  );
} catch (err) {
  logger.error({ err }, 'demo:create failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
