import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each([
    ['/h/123/transactions?month=2026-10', '/h/123/transactions?month=2026-10'],
    ['/', '/'],
  ])('keeps internal path %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('falls back to / for %s', (input) => {
    expect(safeRedirect(input)).toBe('/');
  });
});
