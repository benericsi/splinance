import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildDemoStory, renderDemoBankFiles } from '@splinance/shared';

/**
 * Writes the demo story's bank exports (one Revolut and one K&H file per month) to a folder,
 * the same files the demo seeder imports. With a demo's seed and day they reproduce its
 * bank data exactly, for the data track's bank file pipeline.
 *
 *   pnpm --filter @splinance/api demo:bank-files --out <dir> [--seed 1] [--today YYYY-MM-DD]
 */

const USAGE =
  'Usage: pnpm --filter @splinance/api demo:bank-files --out <dir> [--seed <n>] [--today <YYYY-MM-DD>]';

/** Today in Budapest, where the demo household lives. */
const budapestToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date());

try {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      seed: { type: 'string', default: '1' },
      today: { type: 'string' },
    },
  });
  if (!values.out) throw new Error(USAGE);

  // pnpm runs scripts in the package folder; a relative --out means where the command was typed.
  const out = path.resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
  const story = buildDemoStory({
    seed: Number(values.seed),
    today: values.today ?? budapestToday(),
  });
  const files = renderDemoBankFiles(story);

  await mkdir(out, { recursive: true });
  for (const file of files) {
    await writeFile(path.join(out, file.fileName), file.text, 'utf8');
  }
  process.stdout.write(
    `Wrote ${String(files.length)} files (seed ${String(story.seed)}, ${story.months[0] ?? ''} to ${story.today}) to ${out}\n`,
  );
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
