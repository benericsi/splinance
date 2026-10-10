import { describe, expect, it } from 'vitest';
import {
  createCategoryInputSchema,
  DEFAULT_CATEGORIES,
  updateCategoryInputSchema,
} from './categories';

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

  it('ships valid defaults with unique names per kind', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(createCategoryInputSchema.parse(category)).toEqual(category);
    }
    const keys = DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
