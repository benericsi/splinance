import { describe, expect, it } from 'vitest';
import { liveResponseSchema, readyResponseSchema } from './health';

describe('liveResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(liveResponseSchema.safeParse({ status: 'ok', uptimeSeconds: 1.5 }).success).toBe(true);
  });

  it('rejects negative uptime', () => {
    expect(liveResponseSchema.safeParse({ status: 'ok', uptimeSeconds: -1 }).success).toBe(false);
  });
});

describe('readyResponseSchema', () => {
  it('accepts ok and error states', () => {
    expect(
      readyResponseSchema.safeParse({ status: 'ok', checks: { database: 'ok' } }).success,
    ).toBe(true);
    expect(
      readyResponseSchema.safeParse({ status: 'error', checks: { database: 'error' } }).success,
    ).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(
      readyResponseSchema.safeParse({ status: 'degraded', checks: { database: 'ok' } }).success,
    ).toBe(false);
  });
});
