import { BRAND_COLORS } from '@splinance/shared';
import { patternStyleFor } from '@/components/brand/pattern-style';
import { renderMotif } from '@/components/brand/motifs';
import { cn } from '@/lib/utils';

interface HouseholdAvatarProps {
  household: { id: string; name: string };
  size?: number;
  className?: string;
}

/**
 * One brand motif on a brand pairing, both derived from the household id: stable across
 * renames and distinct between households. Only legible (logo) pairings are used.
 */
export function HouseholdAvatar({ household, size = 32, className }: HouseholdAvatarProps) {
  const { motif, pairing } = patternStyleFor(household.id);
  const bg = BRAND_COLORS[pairing.bg];

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={household.name}
      className={cn('shrink-0 rounded-lg', className)}
    >
      <title>{household.name}</title>
      <rect width="40" height="40" fill={bg} />
      {renderMotif(motif, BRAND_COLORS[pairing.fg], bg)}
    </svg>
  );
}
