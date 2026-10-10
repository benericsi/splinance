import {
  BRAND_COLORS,
  type BrandColor,
  type Category,
  type CategoryIcon,
  type CategoryKind,
} from '@splinance/shared';

export const COLOR_NAMES: Record<BrandColor, string> = {
  green: 'Green',
  pink: 'Pink',
  red: 'Red',
  orange: 'Orange',
  mustard: 'Mustard',
  cream: 'Cream',
  blue: 'Blue',
  sky: 'Sky',
};

/** In palette order, the order the swatches are shown in. */
export const COLORS = Object.keys(BRAND_COLORS) as BrandColor[];

/** "shopping-cart" -> "Shopping cart", "gamepad-2" -> "Gamepad": the accessible name of an icon. */
export function iconName(icon: CategoryIcon): string {
  const words = icon.replace(/-\d+$/, '').replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A color for a new category: the one used least among the active categories of that kind
 * (palette order breaks ties), so new categories do not all look alike.
 */
export function suggestColor(categories: Category[], kind: CategoryKind): BrandColor {
  const used = new Map<BrandColor, number>(COLORS.map((color) => [color, 0]));
  for (const category of categories) {
    if (category.kind === kind && category.archivedAt === null) {
      used.set(category.color, (used.get(category.color) ?? 0) + 1);
    }
  }
  return COLORS.reduce((best, color) =>
    (used.get(color) ?? 0) < (used.get(best) ?? 0) ? color : best,
  );
}
