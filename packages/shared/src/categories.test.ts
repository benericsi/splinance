import { describe, expect, it } from 'vitest';
import {
  createCategoryInputSchema,
  DEFAULT_CATEGORIES,
  defaultCategories,
  updateCategoryInputSchema,
} from './categories';
import { LOCALES } from './i18n/locales';

describe('category schemas', () => {
  const valid = { name: '  Pets ', kind: 'expense', icon: 'paw-print', color: 'orange' };

  it('accepts a valid category and trims the name', () => {
    expect(createCategoryInputSchema.parse(valid).name).toBe('Pets');
  });

  it('rejects unknown icons and colors', () => {
    expect(createCategoryInputSchema.safeParse({ ...valid, icon: 'skull' }).success).toBe(false);
    expect(createCategoryInputSchema.safeParse({ ...valid, color: 'purple' }).success).toBe(false);
  });

  it('rejects empty and long names', () => {
    expect(createCategoryInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(createCategoryInputSchema.safeParse({ ...valid, name: 'x'.repeat(41) }).success).toBe(
      false,
    );
  });

  it('updates any subset except the kind, but not nothing', () => {
    expect(updateCategoryInputSchema.parse({ color: 'blue' })).toEqual({ color: 'blue' });
    expect(updateCategoryInputSchema.safeParse({}).success).toBe(false);
    expect(updateCategoryInputSchema.parse({ name: 'Pets', kind: 'income' })).toEqual({
      name: 'Pets',
    });
  });

  it.each(LOCALES)('ships valid defaults with unique names per kind (%s)', (locale) => {
    const defaults = defaultCategories(locale);
    expect(defaults).toHaveLength(DEFAULT_CATEGORIES.length);
    for (const [index, category] of defaults.entries()) {
      expect(createCategoryInputSchema.parse(category)).toEqual(category);
      // Only the name changes with the language.
      expect({ ...category, name: '' }).toEqual({ ...DEFAULT_CATEGORIES[index], name: '' });
    }
    const keys = defaults.map((c) => `${c.kind}:${c.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
