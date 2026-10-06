import { describe, expect, it } from 'vitest';
import {
  BRAND_COLORS,
  contrastRatio,
  LOGO_PAIRINGS,
  pairingFor,
  PRIMARY_PAIRING,
  readableTextOn,
} from './brand';

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});

describe('brand palette', () => {
  // Guards the palette: changing a color must not make any logo pairing illegible.
  it.each(LOGO_PAIRINGS.map((p) => [`${p.bg} / ${p.fg}`, p] as const))(
    'logo pairing %s reaches 3:1',
    (_, { bg, fg }) => {
      expect(contrastRatio(BRAND_COLORS[bg], BRAND_COLORS[fg])).toBeGreaterThanOrEqual(3);
    },
  );

  it('has a primary pairing that is also a logo pairing', () => {
    expect(LOGO_PAIRINGS).toContainEqual(PRIMARY_PAIRING);
  });

  it('keeps red and green readable as amount text on white (4.5:1)', () => {
    expect(contrastRatio(BRAND_COLORS.red, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(BRAND_COLORS.green, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('pairingFor', () => {
  it('is deterministic and spreads ids across pairings', () => {
    expect(pairingFor('household-1')).toEqual(pairingFor('household-1'));
    const used = new Set(
      Array.from({ length: 200 }, (_, i) => JSON.stringify(pairingFor(`id-${String(i)}`))),
    );
    expect(used.size).toBe(LOGO_PAIRINGS.length);
  });
});

describe('readableTextOn', () => {
  it('picks black on light fills and white on dark fills', () => {
    expect(readableTextOn(BRAND_COLORS.mustard)).toBe('#000000');
    expect(readableTextOn(BRAND_COLORS.blue)).toBe('#FFFFFF');
  });
});
