import { defineConfig } from 'tsdown';

export default defineConfig({
  // demo-create: the showcase household on a server, where there is no tsx
  // (`node dist/demo-create.mjs --seed 42 --days 3650`).
  entry: {
    index: 'src/index.ts',
    migrate: 'src/db/migrate.ts',
    'demo-create': 'src/modules/demo/create.cli.ts',
    // account-erase: repeats deletions after a restore (deploy.md 5).
    'account-erase': 'src/modules/account/erase.cli.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node26',
  // Workspace packages ship TS source, so bundle them into the output.
  deps: { alwaysBundle: [/^@splinance\//] },
  sourcemap: true,
});
