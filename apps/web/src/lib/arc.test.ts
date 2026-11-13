import { describe, expect, it } from 'vitest';
import { arcFill, gaugeGeometry, ringGeometry } from './arc';

describe('arc geometry', () => {
  it('clamps a ratio to what an arc can draw', () => {
    expect(arcFill(0.42)).toBe(0.42);
    expect(arcFill(1.3)).toBe(1);
    expect(arcFill(-0.2)).toBe(0);
    expect(arcFill(Number.NaN)).toBe(0);
    expect(arcFill(Infinity)).toBe(1);
  });

  it('draws a gauge as the upper half circle, round caps inside the box', () => {
    expect(gaugeGeometry(120, 12)).toEqual({
      d: 'M 6 60 A 54 54 0 0 1 114 60',
      viewBox: '0 0 120 66',
    });
  });

  it('draws a ring inside its box', () => {
    expect(ringGeometry(64, 8)).toEqual({ center: 32, r: 28, viewBox: '0 0 64 64' });
  });
});
