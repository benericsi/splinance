import { BRAND_COLORS, type BrandPairing } from '@splinance/shared';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { type Motif, renderMotif } from './motifs';
import { patternStyleFor } from './pattern-style';

interface PatternProps {
  seed: string;
  /** Allow low-contrast decorative pairings (fine for pure decoration, not for avatars). */
  decorative?: boolean;
  motif?: Motif;
  pairing?: BrandPairing;
  /** Size of one motif cell in CSS pixels. */
  cell?: number;
  className?: string;
}

/** Repeating geometric poster pattern; fills its container. Purely decorative. */
export function Pattern({
  seed,
  decorative = false,
  cell = 40,
  className,
  ...override
}: PatternProps) {
  const id = useId();
  const style = patternStyleFor(seed, decorative);
  const motif = override.motif ?? style.motif;
  const pairing = override.pairing ?? style.pairing;
  const bg = BRAND_COLORS[pairing.bg];
  const fg = BRAND_COLORS[pairing.fg];

  return (
    <svg className={cn('block size-full', className)} aria-hidden focusable="false">
      <defs>
        <pattern id={id} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <g transform={`scale(${String(cell / 40)})`}>{renderMotif(motif, fg, bg)}</g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={bg} />
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
