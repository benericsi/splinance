import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR } from './money';
import { allocate, computeSplits, splitProblem, splitRemainder, type SplitSpec } from './splits';

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** Small deterministic PRNG (mulberry32), so the randomized cases are reproducible. */
function random(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

describe('allocate', () => {
  it('splits evenly when it divides', () => {
    expect(allocate(9000, [1, 1, 1])).toEqual([3000, 3000, 3000]);
  });

  it('gives leftover units to the largest remainders, earlier positions on ties', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1001, [1, 1, 1])).toEqual([334, 334, 333]);
    // 100 * 1/6 = 16.67, 100 * 5/6 = 83.33: the larger fraction gets the unit.
    expect(allocate(100, [1, 5])).toEqual([17, 83]);
  });

  it('can give zero to someone when the total is smaller than the number of people', () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it('stays exact where floating point would not', () => {
    const shares = allocate(MAX_AMOUNT_MINOR, [3333, 3333, 3334]);
    expect(sum(shares)).toBe(MAX_AMOUNT_MINOR);
    expect(shares).toEqual([333_300_000_000, 333_300_000_000, 333_400_000_000]);
  });

  it('always sums to the total and never differs from the exact share by a unit or more', () => {
    const next = random(42);
    for (let run = 0; run < 2000; run++) {
      const total = next(MAX_AMOUNT_MINOR);
      const weights = Array.from({ length: 1 + next(8) }, () => 1 + next(10_000));
      const shares = allocate(total, weights);
      expect(sum(shares)).toBe(total);
      const weightSum = sum(weights);
      shares.forEach((share, i) => {
        const exactShare = (total * (weights[i] ?? 0)) / weightSum;
        expect(Math.abs(share - exactShare)).toBeLessThan(1 + 1e-3);
      });
    }
  });

  it('rejects invalid input', () => {
    expect(() => allocate(-1, [1])).toThrow(RangeError);
    expect(() => allocate(1.5, [1])).toThrow(RangeError);
    expect(() => allocate(10, [0, 0])).toThrow(RangeError);
    expect(() => allocate(10, [1, -1])).toThrow(RangeError);
  });
});

describe('computeSplits', () => {
  it('splits equally in the given order', () => {
    expect(computeSplits(1001, { method: 'equal', userIds: ['a', 'b'] })).toEqual([
      { userId: 'a', amount: 501 },
      { userId: 'b', amount: 500 },
    ]);
  });

  it('splits by percentage', () => {
    const spec: SplitSpec = {
      method: 'percentage',
      shares: [
        { userId: 'a', basisPoints: 6000 },
        { userId: 'b', basisPoints: 4000 },
      ],
    };
    expect(computeSplits(12_345, spec)).toEqual([
      { userId: 'a', amount: 7407 },
      { userId: 'b', amount: 4938 },
    ]);
  });

  it('keeps fixed amounts as entered', () => {
    const spec: SplitSpec = {
      method: 'fixed',
      shares: [
        { userId: 'a', amount: 700 },
        { userId: 'b', amount: 300 },
      ],
    };
    expect(computeSplits(1000, spec)).toEqual(spec.shares);
  });

  it('throws on an invalid spec', () => {
    expect(() => computeSplits(1000, { method: 'equal', userIds: [] })).toThrow(/no-members/);
  });
});

describe('splitProblem and splitRemainder', () => {
  const percentage = (...basisPoints: number[]): SplitSpec => ({
    method: 'percentage',
    shares: basisPoints.map((bp, i) => ({ userId: `u${String(i)}`, basisPoints: bp })),
  });
  const fixed = (...amounts: number[]): SplitSpec => ({
    method: 'fixed',
    shares: amounts.map((amount, i) => ({ userId: `u${String(i)}`, amount })),
  });

  it('accepts valid specs', () => {
    expect(splitProblem(1000, { method: 'equal', userIds: ['a'] })).toBeUndefined();
    expect(splitProblem(1000, percentage(3333, 3333, 3334))).toBeUndefined();
    expect(splitProblem(1000, fixed(999, 1))).toBeUndefined();
  });

  it('names the problem', () => {
    expect(splitProblem(1000, { method: 'equal', userIds: [] })).toBe('no-members');
    expect(splitProblem(1000, { method: 'equal', userIds: ['a', 'a'] })).toBe('duplicate-member');
    expect(splitProblem(1000, percentage(10_000, 0))).toBe('invalid-value');
    expect(splitProblem(1000, fixed(500.5, 499.5))).toBe('invalid-value');
    expect(splitProblem(1000, percentage(5000, 4000))).toBe('percentage-total');
    expect(splitProblem(1000, fixed(600, 500))).toBe('fixed-total');
  });

  it('reports what is left to assign', () => {
    expect(splitRemainder(1000, { method: 'equal', userIds: ['a'] })).toBe(0);
    expect(splitRemainder(1000, percentage(5000, 4000))).toBe(1000);
    expect(splitRemainder(1000, fixed(600, 500))).toBe(-100);
  });
});
