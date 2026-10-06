import type { ReactNode } from 'react';

/** Geometric motifs drawn in a 40x40 box: repeated as patterns, or alone as avatars. */
export const MOTIFS = [
  'dots',
  'quarters',
  'triangles',
  'rings',
  'halves',
  'flowers',
  'diamonds',
  'stripes',
] as const;

export type Motif = (typeof MOTIFS)[number];

/** `bg` is needed by motifs that cut holes (flower centers). */
export function renderMotif(motif: Motif, fg: string, bg: string): ReactNode {
  switch (motif) {
    case 'dots':
      return <circle cx="20" cy="20" r="9" fill={fg} />;
    case 'quarters':
      return <path d="M7 7A26 26 0 0 1 33 33L7 33Z" fill={fg} />;
    case 'triangles':
      return <path d="M6 32L20 8L34 32Z" fill={fg} />;
    case 'rings':
      return <circle cx="20" cy="20" r="11" fill="none" stroke={fg} strokeWidth="5" />;
    case 'halves':
      return <path d="M6 27A14 14 0 0 1 34 27Z" fill={fg} />;
    case 'flowers':
      return (
        <>
          <g fill={fg}>
            <circle cx="20" cy="12.5" r="7.5" />
            <circle cx="20" cy="27.5" r="7.5" />
            <circle cx="12.5" cy="20" r="7.5" />
            <circle cx="27.5" cy="20" r="7.5" />
          </g>
          <circle cx="20" cy="20" r="3.5" fill={bg} />
        </>
      );
    case 'diamonds':
      return <path d="M20 5L35 20L20 35L5 20Z" fill={fg} />;
    case 'stripes':
      return <rect x="0" y="13" width="40" height="14" fill={fg} />;
  }
}
