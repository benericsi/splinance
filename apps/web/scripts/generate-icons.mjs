// Renders PNG icons: crisp favicon.svg for small sizes, grainy logo.svg for the large iOS icon.
// Run after changing the logo: pnpm --filter @splinance/web gen:icons
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const logo = await readFile(`${publicDir}logo.svg`, 'utf8');
const sources = {
  favicon: await readFile(`${publicDir}favicon.svg`),
  // iOS rounds the corners itself and shows any inner rounding as a visible edge,
  // so the home-screen icon uses a full-bleed square tile.
  logoFullBleed: Buffer.from(
    logo
      .replaceAll(
        'x="4" y="4" width="56" height="56" rx="16"',
        'x="0" y="0" width="64" height="64"',
      )
      .replaceAll('x="4" y="4" width="56" height="56"', 'x="0" y="0" width="64" height="64"'),
  ),
};

const icons = [
  // Legacy browsers that ignore SVG favicons.
  { file: 'favicon-32.png', size: 32, source: 'favicon' },
  { file: 'apple-touch-icon.png', size: 180, source: 'logoFullBleed' },
];

for (const { file, size, source } of icons) {
  const image = sharp(sources[source], { density: 384 }).resize(size, size);
  await image.png({ compressionLevel: 9 }).toFile(`${publicDir}${file}`);
  console.log(`Wrote public/${file} (${String(size)}px)`);
}
