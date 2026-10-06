import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', migrate: 'src/db/migrate.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Workspace packages ship TS source, so bundle them into the output.
  deps: { alwaysBundle: [/^@splinance\//] },
  sourcemap: true,
});
