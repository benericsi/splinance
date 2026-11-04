import { describe, expect, it } from 'vitest';
import { authProvidersResponseSchema, oauthErrorCodeSchema, safeRedirectPath } from './oauth';

const ORIGIN = 'https://splinance.com';

describe('safeRedirectPath', () => {
  it.each([
    ['/h/123/transactions?month=2026-10', '/h/123/transactions?month=2026-10'],
    ['/', '/'],
    ['/invite#abc', '/invite#abc'],
    ['/h/1/../2', '/h/2'],
  ])('keeps internal path %s', (input, expected) => {
    expect(safeRedirectPath(input, ORIGIN)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    '/ /evil.example',
    '/h/1\\..\\..\\evil',
    `/${'a'.repeat(2048)}`,
  ])('falls back to / for %j', (input) => {
    expect(safeRedirectPath(input, ORIGIN)).toBe('/');
  });
});

describe('oauth schemas', () => {
  it('accepts known error codes only', () => {
    expect(oauthErrorCodeSchema.safeParse('cancelled').success).toBe(true);
    expect(oauthErrorCodeSchema.safeParse('anything').success).toBe(false);
  });

  it('accepts provider ids in the database format', () => {
    expect(authProvidersResponseSchema.safeParse({ providers: [{ id: 'google' }] }).success).toBe(
      true,
    );
    expect(authProvidersResponseSchema.safeParse({ providers: [{ id: 'Google' }] }).success).toBe(
      false,
    );
  });
});
