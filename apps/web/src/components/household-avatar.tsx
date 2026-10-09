import { BRAND_COLORS } from '@splinance/shared';
import { motifStyleFor } from '@/components/brand/motif-style';
import { renderMotif } from '@/components/brand/motifs';
import { cn } from '@/lib/utils';

interface HouseholdAvatarProps {
  household: { id: string; name: string };
  size?: number;
  className?: string;
  /** Hide from assistive tech when the name is already shown next to it. */
  decorative?: boolean;
}

/**
 * One brand motif on a brand pairing, both derived from the household id: stable across
 * renames and distinct between households. Only legible (logo) pairings are used.
 */
export function HouseholdAvatar({
  household,
  size = 32,
  className,
  decorative = false,
}: HouseholdAvatarProps) {
  const { motif, pairing } = motifStyleFor(household.id);
  const bg = BRAND_COLORS[pairing.bg];

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': household.name })}
      className={cn('shrink-0 rounded-lg', className)}
    >
      {!decorative && <title>{household.name}</title>}
      <rect width="40" height="40" fill={bg} />
      {renderMotif(motif, BRAND_COLORS[pairing.fg], bg)}
    </svg>
  );
}
