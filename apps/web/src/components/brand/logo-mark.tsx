import { BRAND_COLORS as B } from '@splinance/shared';
import { useId } from 'react';

// The split S (chunky monoline): two strokes with a ~3 unit gap in the middle.
// Shared with public/favicon.svg and public/logo.svg; keep all three in sync.
const SPLIT_S_TOP =
  'M42.5 20.5C42.5 15.5 37.5 12.5 32 12.5C25.5 12.5 21 15.8 21 21.2C21 25 23.8 27.1 27.6 28.1';
const SPLIT_S_BOTTOM =
  'M36.4 35.9C40.3 37.2 43 39.4 43 43C43 48.2 38.5 51.5 32 51.5C26 51.5 21.2 48.8 21 43';

// Lightest point of the tile glow. Brighter blues drop the orange end of the S below
// 3:1 (#3B3BFF would be 2.28:1); #1515E8 keeps it at 3.2:1.
const TILE_GLOW = '#1515E8';

/**
 * The Splinance mark: pink-to-orange split S on a softly lit blue tile. Crisp at every
 * size; the grainy version lives in public/logo.svg for large, static uses.
 * Decorative: the visible "Splinance" wordmark or an aria-label nearby names it.
 */
export function LogoMark({ className }: { className?: string }) {
  // Gradient ids are document-global; prefix them per instance.
  const id = useId().replace(/:/g, '');

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}-tile`} cx=".3" cy=".25" r=".9">
          <stop offset="0" stopColor={TILE_GLOW} />
          <stop offset="1" stopColor={B.blue} />
        </radialGradient>
        {/* One gradient across the whole S, so the two halves continue each other. */}
        <linearGradient
          id={`${id}-s`}
          gradientUnits="userSpaceOnUse"
          x1="22"
          y1="13"
          x2="42"
          y2="51"
        >
          <stop offset="0" stopColor={B.pink} />
          <stop offset="1" stopColor={B.orange} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${id}-tile)`} />
      <g fill="none" stroke={`url(#${id}-s)`} strokeWidth="8.5" strokeLinecap="round">
        <path d={SPLIT_S_TOP} />
        <path d={SPLIT_S_BOTTOM} />
      </g>
    </svg>
  );
}
