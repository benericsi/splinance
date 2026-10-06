import { BRAND_COLORS, type BrandPairing, PRIMARY_PAIRING } from '@splinance/shared';

// The split S: two strokes with a gap in the middle. Shared with public/favicon.svg.
export const SPLIT_S_TOP =
  'M42 21C42 16 37.5 13.5 32 13.5C26 13.5 22 16.5 22 21.5C22 25.5 25 27.6 29 28.6';
export const SPLIT_S_BOTTOM =
  'M35 35.4C39.5 36.6 42 38.8 42 42.5C42 47.5 38 50.5 32 50.5C26.5 50.5 22 48 22 43';

interface LogoMarkProps {
  pairing?: BrandPairing | undefined;
  /** With the rounded tile (app icon); without it, just the S in the foreground color. */
  tile?: boolean;
  className?: string;
}

/** Decorative: the visible "Splinance" wordmark or an aria-label nearby names it. */
export function LogoMark({ pairing = PRIMARY_PAIRING, tile = true, className }: LogoMarkProps) {
  const fg = BRAND_COLORS[pairing.fg];
  return (
    <svg
      viewBox={tile ? '0 0 64 64' : '16 10 32 44'}
      className={className}
      aria-hidden
      focusable="false"
    >
      {tile && <rect x="4" y="4" width="56" height="56" rx="16" fill={BRAND_COLORS[pairing.bg]} />}
      <g fill="none" stroke={fg} strokeWidth="6" strokeLinecap="round">
        <path d={SPLIT_S_TOP} />
        <path d={SPLIT_S_BOTTOM} />
      </g>
    </svg>
  );
}
