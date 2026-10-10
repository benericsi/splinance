export const SPLIT_METHODS = ['equal', 'percentage', 'fixed'] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/** Percentages are basis points: 100% = 10 000, so 33.33% is an exact integer. */
export const PERCENT_SCALE = 10_000;

/** How the person entering a transaction divided it. Order decides who gets leftover units. */
export type SplitSpec =
  | { method: 'equal'; userIds: readonly string[] }
  | { method: 'percentage'; shares: readonly { userId: string; basisPoints: number }[] }
  | { method: 'fixed'; shares: readonly { userId: string; amount: number }[] };

export interface SplitShare {
  userId: string;
  amount: number;
}

export type SplitProblem =
  'no-members' | 'duplicate-member' | 'invalid-value' | 'percentage-total' | 'fixed-total';

/**
 * Divides `total` (minor units) in proportion to integer `weights` with the largest remainder
 * method: everyone gets the floor of their exact share, then the units lost to rounding go
 * one each to the largest fractional parts (ties: earlier position first). The result always
 * sums to `total`. BigInt keeps `total * weight` exact beyond 2^53.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError('allocate: total must be a non-negative safe integer');
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError('allocate: weights must be non-negative safe integers');
  }
  const weightSum = weights.reduce((sum, w) => sum + BigInt(w), 0n);
  if (weightSum === 0n) throw new RangeError('allocate: weights must not all be zero');

  const exact = weights.map((w) => BigInt(total) * BigInt(w));
  const shares = exact.map((value) => value / weightSum);
  let leftover = BigInt(total) - shares.reduce((sum, share) => sum + share, 0n);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value % weightSum }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    shares[index] = (shares[index] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return shares.map(Number);
}

function userIdsOf(spec: SplitSpec): readonly string[] {
  return spec.method === 'equal' ? spec.userIds : spec.shares.map((share) => share.userId);
}

/**
 * What is left to assign: basis points for percentage splits, minor units for fixed splits
 * (negative when over-assigned), always 0 for equal splits. Drives the live hint in the form.
 */
export function splitRemainder(total: number, spec: SplitSpec): number {
  switch (spec.method) {
    case 'equal':
      return 0;
    case 'percentage':
      return PERCENT_SCALE - spec.shares.reduce((sum, share) => sum + share.basisPoints, 0);
    case 'fixed':
      return total - spec.shares.reduce((sum, share) => sum + share.amount, 0);
  }
}

/** Why a split cannot be computed, or undefined when it is valid. */
export function splitProblem(total: number, spec: SplitSpec): SplitProblem | undefined {
  const userIds = userIdsOf(spec);
  if (userIds.length === 0) return 'no-members';
  if (new Set(userIds).size !== userIds.length) return 'duplicate-member';
  if (spec.method !== 'equal') {
    const values = spec.shares.map((share) =>
      'basisPoints' in share ? share.basisPoints : share.amount,
    );
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      return 'invalid-value';
    }
  }
  if (splitRemainder(total, spec) !== 0) {
    return spec.method === 'percentage' ? 'percentage-total' : 'fixed-total';
  }
  return undefined;
}

/**
 * Each person's share in minor units, in the order given. Shares always sum to `total`.
 * Throws a RangeError for an invalid spec; validate with `splitProblem` first.
 */
export function computeSplits(total: number, spec: SplitSpec): SplitShare[] {
  const problem = splitProblem(total, spec);
  if (problem) throw new RangeError(`computeSplits: ${problem}`);

  switch (spec.method) {
    case 'equal': {
      const amounts = allocate(
        total,
        spec.userIds.map(() => 1),
      );
      return spec.userIds.map((userId, i) => ({ userId, amount: amounts[i] ?? 0 }));
    }
    case 'percentage': {
      const amounts = allocate(
        total,
        spec.shares.map((share) => share.basisPoints),
      );
      return spec.shares.map(({ userId }, i) => ({ userId, amount: amounts[i] ?? 0 }));
    }
    case 'fixed':
      return spec.shares.map(({ userId, amount }) => ({ userId, amount }));
  }
}
