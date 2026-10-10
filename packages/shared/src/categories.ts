import { z } from 'zod';
import { BRAND_COLORS, type BrandColor } from './brand';

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

/**
 * Icons a category may use: lucide names (kebab-case), checked against lucide-react by a web
 * test. A closed list keeps the picker curated and the stored value safe to render.
 */
export const CATEGORY_ICONS = [
  'shopping-cart',
  'shopping-bag',
  'house',
  'zap',
  'droplet',
  'flame',
  'wifi',
  'smartphone',
  'utensils',
  'coffee',
  'bus',
  'car',
  'fuel',
  'plane',
  'heart-pulse',
  'pill',
  'shirt',
  'film',
  'music',
  'gamepad-2',
  'book-open',
  'graduation-cap',
  'baby',
  'paw-print',
  'gift',
  'dumbbell',
  'scissors',
  'wrench',
  'shield',
  'receipt',
  'piggy-bank',
  'briefcase',
  'banknote',
  'hand-coins',
  'tag',
] as const;
export const categoryIconSchema = z.enum(CATEGORY_ICONS);
export type CategoryIcon = z.infer<typeof categoryIconSchema>;

/** Category colors are brand palette keys, rendered as fills (text color via readableTextOn). */
export const categoryColorSchema = z.enum(
  Object.keys(BRAND_COLORS) as [BrandColor, ...BrandColor[]],
);

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(40, 'Name must be at most 40 characters');

export const createCategoryInputSchema = z.object({
  name: categoryNameSchema,
  kind: categoryKindSchema,
  icon: categoryIconSchema,
  color: categoryColorSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

/** The kind is fixed at creation: transactions already filed under it must stay consistent. */
export const updateCategoryInputSchema = createCategoryInputSchema
  .omit({ kind: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Nothing to update');

export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: categoryKindSchema,
  icon: categoryIconSchema,
  color: categoryColorSchema,
  /** Archived categories stay readable so old transactions still show them. */
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type Category = z.infer<typeof categorySchema>;

export const categoryResponseSchema = z.object({ category: categorySchema });
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

export const categoryListResponseSchema = z.object({ categories: z.array(categorySchema) });
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;

/** Every new household starts with these. Migration 0004 backfilled them for older ones. */
export const DEFAULT_CATEGORIES: readonly CreateCategoryInput[] = [
  { name: 'Groceries', kind: 'expense', icon: 'shopping-cart', color: 'green' },
  { name: 'Housing', kind: 'expense', icon: 'house', color: 'blue' },
  { name: 'Utilities', kind: 'expense', icon: 'zap', color: 'mustard' },
  { name: 'Eating out', kind: 'expense', icon: 'utensils', color: 'orange' },
  { name: 'Transport', kind: 'expense', icon: 'bus', color: 'sky' },
  { name: 'Health', kind: 'expense', icon: 'heart-pulse', color: 'red' },
  { name: 'Shopping', kind: 'expense', icon: 'shopping-bag', color: 'pink' },
  { name: 'Entertainment', kind: 'expense', icon: 'film', color: 'blue' },
  { name: 'Travel', kind: 'expense', icon: 'plane', color: 'sky' },
  { name: 'Other', kind: 'expense', icon: 'tag', color: 'cream' },
  { name: 'Salary', kind: 'income', icon: 'briefcase', color: 'green' },
  { name: 'Other income', kind: 'income', icon: 'banknote', color: 'mustard' },
];
