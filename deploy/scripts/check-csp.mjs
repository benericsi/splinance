// Every inline <script> of the built web apps must be allowed by the Caddyfile's CSP hash,
// or the browser refuses it in production (the theme script: a light flash, or worse).
// Runs in the web image build and in CI after `build` and `build:demo`:
//   node deploy/scripts/check-csp.mjs [repo root]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? '.';
const caddyfile = readFileSync(join(root, 'deploy/web/Caddyfile'), 'utf8');
const pages = ['apps/web/dist/index.html', 'apps/web/dist-demo/index.html'];
const inline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

const missing = [];
for (const page of pages) {
  const html = readFileSync(join(root, page), 'utf8');
  for (const [, body] of html.matchAll(inline)) {
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!caddyfile.includes(hash)) missing.push(`${page}: ${hash}`);
  }
}

if (missing.length > 0) {
  console.error('Inline scripts not allowed by the CSP in deploy/web/Caddyfile:');
  for (const line of missing) console.error(`  ${line}`);
  console.error('Add the hash to script-src (and drop the old one if the script changed).');
  process.exit(1);
}
console.log(`CSP covers every inline script in ${pages.length} pages`);
