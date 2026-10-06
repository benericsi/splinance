/**
 * Splinance brand palette: warm retro colors, tuned so every logo pairing reaches
 * at least 3:1 contrast (WCAG non-text minimum). Green and red were darkened slightly
 * from the source palette for that reason.
 */
export const BRAND_COLORS = {
  green: '#016944',
  pink: '#FF8EA5',
  red: '#D41712',
  orange: '#FF6C2C',
  mustard: '#F7BD01',
  cream: '#F1D9BD',
  blue: '#0000D4',
  sky: '#87D9E7',
} as const;

export type BrandColor = keyof typeof BRAND_COLORS;

export interface BrandPairing {
  bg: BrandColor;
  fg: BrandColor;
}

/** Background/foreground pairs legible enough for the logo, text-like marks and avatars. */
export const LOGO_PAIRINGS: readonly BrandPairing[] = [
  { bg: 'blue', fg: 'pink' },
  { bg: 'cream', fg: 'blue' },
  { bg: 'sky', fg: 'blue' },
  { bg: 'green', fg: 'pink' },
  { bg: 'pink', fg: 'green' },
  { bg: 'red', fg: 'mustard' },
  { bg: 'mustard', fg: 'red' },
  { bg: 'red', fg: 'sky' },
  { bg: 'sky', fg: 'red' },
  { bg: 'cream', fg: 'red' },
  { bg: 'orange', fg: 'blue' },
  { bg: 'cream', fg: 'green' },
];

/** The primary pairing: app icon, favicon, default logo. */
export const PRIMARY_PAIRING: BrandPairing = { bg: 'blue', fg: 'pink' };

/** FNV-1a: small, fast and stable across platforms, so ids always map to the same pairing. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic pairing for an id (household avatars, covers). */
export function pairingFor(seed: string, pairings: readonly BrandPairing[] = LOGO_PAIRINGS) {
  const pairing = pairings[hashString(seed) % pairings.length];
  if (!pairing) throw new Error('pairingFor needs at least one pairing');
  return pairing;
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Black or white text, whichever reads better on the given fill (e.g. category badges). */
export function readableTextOn(background: string): '#000000' | '#FFFFFF' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF';
}
