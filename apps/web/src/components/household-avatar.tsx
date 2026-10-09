import { GradientAvatar } from '@outpacelabs/avatars';
import { BRAND_COLORS } from '@splinance/shared';
import { cn } from '@/lib/utils';

// Brand palette minus cream (too close to light backgrounds), like user avatars.
const GRADIENT_COLORS = [
  BRAND_COLORS.blue,
  BRAND_COLORS.green,
  BRAND_COLORS.red,
  BRAND_COLORS.orange,
  BRAND_COLORS.pink,
  BRAND_COLORS.sky,
  BRAND_COLORS.mustard,
];

interface HouseholdAvatarProps {
  household: { id: string; name: string };
  size?: number;
  className?: string;
  /** Hide from assistive tech when the name is already shown next to it. */
  decorative?: boolean;
}

/**
 * The only place that knows about @outpacelabs/avatars. A mesh gradient in brand colors,
 * seeded with the household id: stable across renames and distinct between households.
 * Rounded square, so households never look like people (round user avatars).
 */
export function HouseholdAvatar({
  household,
  size = 32,
  className,
  decorative = false,
}: HouseholdAvatarProps) {
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': household.name })}
      title={decorative ? undefined : household.name}
      className={cn('inline-flex shrink-0', className)}
    >
      <GradientAvatar
        seed={household.id}
        size={size}
        radius={Math.round(size * 0.25)}
        colors={GRADIENT_COLORS}
      />
    </span>
  );
}
