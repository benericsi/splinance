import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each([
    ['/h/123/transactions?month=2026-10', '/h/123/transactions?month=2026-10'],
    ['/', '/'],
    ['/invite#abc', '/invite#abc'],
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
    // URL parsing drops tabs and newlines, which would turn these into //evil.example.
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/ /evil.example',
    '/h/1\\..\\..\\evil',
  ])('falls back to / for %j', (input) => {
    expect(safeRedirect(input)).toBe('/');
  });
});
