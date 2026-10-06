import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(healthResponseSchema.parse({ status: 'ok', uptimeSeconds: 1.5 })).toEqual({
      status: 'ok',
      uptimeSeconds: 1.5,
    });
  });

  it('rejects negative uptime', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', uptimeSeconds: -1 }).success).toBe(false);
  });
});
