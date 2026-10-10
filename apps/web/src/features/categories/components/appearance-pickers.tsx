import {
  BRAND_COLORS,
  type BrandColor,
  CATEGORY_ICONS,
  type CategoryIcon,
} from '@splinance/shared';
import { cn } from '@/lib/utils';
import { COLOR_NAMES, COLORS, iconName } from '../appearance';
import { CATEGORY_ICON_COMPONENTS } from './category-tile';

/*
 * Native radio inputs (visually hidden) behind the swatches and icons: arrow keys, Tab into
 * the group, and screen reader announcements ("Pink, radio button, 2 of 8") come for free.
 */

export function ColorPicker({
  value,
  onChange,
}: {
  value: BrandColor;
  onChange: (color: BrandColor) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Color</legend>
      <div className="flex flex-wrap gap-2.5">
        {COLORS.map((color) => (
          <label key={color} className="relative cursor-pointer">
            <input
              type="radio"
              name="category-color"
              value={color}
              checked={value === color}
              onChange={() => {
                onChange(color);
              }}
              className="peer sr-only"
            />
            <span className="sr-only">{COLOR_NAMES[color]}</span>
            <span
              aria-hidden
              className="ring-offset-background peer-checked:ring-foreground peer-focus-visible:ring-ring/60 block size-8 rounded-full border border-black/10 ring-offset-2 peer-checked:ring-2 peer-focus-visible:ring-3 dark:border-white/15"
              style={{ backgroundColor: BRAND_COLORS[color] }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function IconPicker({
  value,
  onChange,
}: {
  value: CategoryIcon;
  onChange: (icon: CategoryIcon) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Icon</legend>
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
        {CATEGORY_ICONS.map((icon) => {
          const Icon = CATEGORY_ICON_COMPONENTS[icon];
          return (
            <label key={icon} className="cursor-pointer">
              <input
                type="radio"
                name="category-icon"
                value={icon}
                checked={value === icon}
                onChange={() => {
                  onChange(icon);
                }}
                className="peer sr-only"
              />
              <span className="sr-only">{iconName(icon)}</span>
              <span
                aria-hidden
                className={cn(
                  'text-muted-foreground hover:bg-muted flex aspect-square items-center justify-center rounded-lg border border-transparent [&_svg]:size-[18px]',
                  'peer-checked:border-foreground peer-checked:bg-muted peer-checked:text-foreground',
                  'peer-focus-visible:ring-ring/50 peer-focus-visible:ring-3',
                )}
              >
                <Icon />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
