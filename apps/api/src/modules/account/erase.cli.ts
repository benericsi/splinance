import { parseArgs } from 'node:util';
import { z } from 'zod';
import { pool } from '../../db/client';
import { logger } from '../../lib/logger';
import { eraseAccount } from './deletion.service';

/**
 * Repeats account deletions after a restore (docs/deploy.md 5): the backup was taken before
 * them, so the restored database still holds those people. Takes the user ids of the
 * `account.deleted` log lines made after the backup's date. Skips ids already deleted.
 *
 *   pnpm --filter @splinance/api account:erase <userId> [<userId> ...]
 *   node dist/account-erase.mjs <userId> [...]    (the built API, on a server)
 */
try {
  const { positionals } = parseArgs({ allowPositionals: true });
  const ids = z.array(z.uuid()).min(1).safeParse(positionals);
  if (!ids.success) {
    throw new Error('Usage: account:erase <userId> [<userId> ...] (uuids from account.deleted)');
  }
  for (const userId of ids.data) {
    const result = await eraseAccount(userId);
    process.stdout.write(
      result
        ? `Erased ${userId}: ${JSON.stringify(result)}\n`
        : `Skipped ${userId}: unknown or already deleted\n`,
    );
  }
} catch (err) {
  logger.error({ err }, 'account:erase failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
