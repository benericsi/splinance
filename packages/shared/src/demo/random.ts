/**
 * A small seeded random number generator (mulberry32): the same seed gives the same
 * sequence on every machine, so a demo household can be rebuilt exactly from its seed.
 * Not for anything secret.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    /** An integer from `min` to `max`, both included. */
    int: (min: number, max: number): number => min + Math.floor(next() * (max - min + 1)),
    chance: (probability: number): boolean => next() < probability,
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new RangeError('pick: no items');
      return item;
    },
  };
}

export type Random = ReturnType<typeof createRandom>;
