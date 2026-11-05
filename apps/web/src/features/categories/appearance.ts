import {
  BRAND_COLORS,
  type BrandColor,
  type Category,
  type CategoryIcon,
  type CategoryKind,
} from '@splinance/shared';
import { i18n } from '@/i18n';

/** The color's name in the UI language (a swatch's accessible name). */
export const colorName = (color: BrandColor): string => i18n.t(`categories:colors.${color}`);

/** In palette order, the order the swatches are shown in. */
export const COLORS = Object.keys(BRAND_COLORS) as BrandColor[];

/** The accessible name of an icon in the UI language: "shopping-cart" -> "Shopping cart". */
export const iconName = (icon: CategoryIcon): string => i18n.t(`categories:icons.${icon}`);

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
