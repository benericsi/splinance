import { API_ERROR_CODES } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { hu } from './locales/hu';

type Tree = { [key: string]: string | Tree };

/** Every key path with its text: `account.devices.signedOut_one`. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') entries.set(path, value);
    else for (const [k, v] of flatten(value, path)) entries.set(k, v);
  }
  return entries;
}

/** What a translation must keep: each {{variable}} and <tag>, in any order and count. */
const placeholders = (text: string) => [
  ...new Set(
    [...text.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?(\w+)>/g)]
      .map((m) => m[0].replace(/\s/g, ''))
      .sort(),
  ),
];

const english = flatten(en);
const hungarian = flatten(hu);

describe('catalogs', () => {
  it('has the same keys in every language', () => {
    expect([...hungarian.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('has no empty text', () => {
    for (const [key, text] of [...english, ...hungarian]) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('keeps every variable and tag of the English text', () => {
    for (const [key, text] of english) {
      expect(placeholders(hungarian.get(key) ?? ''), key).toEqual(placeholders(text));
    }
  });

  it('has words for every API error code', () => {
    for (const code of API_ERROR_CODES) {
      expect(english.has(`errors.codes.${code}`), code).toBe(true);
      expect(hungarian.has(`errors.codes.${code}`), code).toBe(true);
    }
  });

  it('never uses a void HTML element name as a tag (the parser closes <link> at once)', () => {
    for (const [key, text] of [...english, ...hungarian]) {
      expect(text, key).not.toMatch(/<(link|br|img|input|meta|hr)>/);
    }
  });
});
