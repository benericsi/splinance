import { parseArgs } from 'node:util';
import { matchLocale } from '@splinance/shared';
import { env } from '../../config/env';
import { pool } from '../../db/client';
import { logger } from '../../lib/logger';
import { createSandbox } from './demo.service';

/**
 * Creates a sandbox on the configured (demo) database without signing anyone in: a
 * long-lived showcase household for the data track (`--days 3650`), or one to inspect.
 * Its bank files come from `demo:bank-files` with the printed seed and day.
 *
 *   pnpm --filter @splinance/api demo:create [--seed <n>] [--today <YYYY-MM-DD>] [--days <n>] [--locale en|hu]
 *   node dist/demo-create.mjs [...]    (the built API, on a server)
 */

const USAGE =
  'Usage: demo:create (or node dist/demo-create.mjs) [--seed <n>] [--today <YYYY-MM-DD>] [--days <n>] [--locale en|hu]';

try {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string' },
      today: { type: 'string' },
      days: { type: 'string' },
      locale: { type: 'string' },
    },
  });
  const locale = matchLocale(values.locale);
  if (values.locale !== undefined && locale === undefined) throw new Error(USAGE);
  const days = values.days === undefined ? env.DEMO_TTL_DAYS : Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 36_500) throw new Error(USAGE);

  const sandbox = await createSandbox(
    { ttlDays: days, maxActive: env.DEMO_MAX_ACTIVE },
    {
      ...(values.seed !== undefined && { seed: Number(values.seed) }),
      ...(values.today !== undefined && { today: values.today }),
      ...(locale && { locale }),
    },
  );
  process.stdout.write(
    [
      `Demo ${sandbox.demoId}`,
      `  household ${sandbox.householdId}`,
      `  seed ${String(sandbox.seed)}, story until ${sandbox.today}, in ${sandbox.locale}`,
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
