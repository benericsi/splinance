// Renders PNG icons from public/favicon.svg (the source of truth).
// Run after changing the logo: pnpm --filter @splinance/web gen:icons
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await readFile(`${publicDir}favicon.svg`);

const icons = [
  // Legacy browsers that ignore SVG favicons.
  { file: 'favicon-32.png', size: 32, padding: 0 },
  // iOS home screen: full-bleed square (iOS rounds the corners itself), so render the
  // tile slightly enlarged to hide the transparent margin of the SVG.
  { file: 'apple-touch-icon.png', size: 180, padding: -12, background: '#0000D4' },
];

for (const { file, size, padding, background } of icons) {
  const inner = size - padding * 2;
  let image = sharp(svg, { density: 384 }).resize(inner, inner);
  if (padding < 0) {
    const crop = -padding;
    image = sharp(await image.png().toBuffer()).extract({
      left: crop,
      top: crop,
      width: size,
      height: size,
    });
  }
  if (background) image = image.flatten({ background });
  await image.png({ compressionLevel: 9 }).toFile(`${publicDir}${file}`);
  console.log(`Wrote public/${file} (${String(size)}px)`);
}
