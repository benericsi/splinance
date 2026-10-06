import { BRAND_COLORS as B } from '@splinance/shared';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Art-only tints used inside gradients (never for UI or text). Everything else comes
 * from the brand palette.
 */
const TINT = {
  night: '#16131F',
  indigoNight: '#1B1340',
  violet: '#5B2BD6',
  blush: '#FFE3EC',
  wine: '#5B0E1A',
  butter: '#FFF4D6',
  mint: '#3DD68C',
  fog: '#C9D1D3',
  white: '#FFFFFF',
} as const;

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Color at t (0..1) along evenly spaced stops. */
function sample(stops: readonly string[], t: number): string {
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const [a, b] = [toRgb(stops[i] ?? '#000000'), toRgb(stops[i + 1] ?? '#000000')];
  const local = scaled - i;
  return toHex(a.map((v, k) => v + ((b[k] ?? 0) - v) * local) as Rgb);
}

// Pure geometry, computed once at module load.
const ARC_COUNT = 26;
const LEFT_ARCS = Array.from({ length: ARC_COUNT }, (_, i) =>
  sample([TINT.blush, B.pink, B.red, TINT.wine], i / (ARC_COUNT - 1)),
);
const RIGHT_ARCS = Array.from({ length: ARC_COUNT }, (_, i) =>
  sample([TINT.butter, B.sky, B.blue, TINT.night], i / (ARC_COUNT - 1)),
);
const RAYS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  return {
    x1: 60 + Math.cos(a) * 16,
    y1: 80 + Math.sin(a) * 16,
    x2: 60 + Math.cos(a) * 42,
    y2: 80 + Math.sin(a) * 42,
  };
});
const SPECTRUM = [
  { color: B.blue, angle: -62 },
  { color: B.sky, angle: -54 },
  { color: TINT.mint, angle: -46 },
  { color: B.mustard, angle: -38 },
  { color: B.orange, angle: -30 },
  { color: B.red, angle: -22 },
];
const TRIANGLES = [
  [60, 36],
  [48, 57],
  [72, 57],
  [36, 78],
  [60, 78],
  [84, 78],
  [24, 99],
  [48, 99],
  [72, 99],
  [96, 99],
] as const;

function Card({ children, bg }: { children: ReactNode; bg: string }) {
  return (
    // slice: grid gaps make cells a hair off 3:4; trim that instead of letterboxing.
    <svg
      viewBox="0 0 120 160"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full rounded-xl"
      focusable="false"
    >
      <rect width="120" height="160" fill={bg} />
      {children}
    </svg>
  );
}

/**
 * Curated showcase for the auth screen: 8 hand-composed cards mixing grainy gradients
 * ("light") and graphic-system symbols, no two neighbors alike. Purely decorative.
 *
 * Fills the space it is given (pass a size via className, e.g. flex-1): a size container
 * measures it, the grid switches 4x2 (landscape) / 2x4 (portrait), and the grid takes the
 * largest size that keeps every card at 3:4 and never overflows.
 */
export function PosterWall({ className }: { className?: string }) {
  // SVG ids are document-global; prefix them so two walls never collide.
  const id = useId().replace(/:/g, '');
  const ref = (name: string) => `url(#${id}-${name})`;

  return (
    <div
      className={cn('flex min-h-0 items-center justify-center [container-type:size]', className)}
      aria-hidden
    >
      <div
        className={cn(
          // 4 cards of 3:4 side by side, 2 rows: grid aspect 3:2.
          'grid aspect-[3/2] w-[min(100cqw,150cqh)] grid-cols-4 grid-rows-2 gap-3',
          // Portrait space (aspect < 0.75, the crossover point): 2 columns, 4 rows, aspect 3:8.
          '[@container(aspect-ratio<0.75)]:aspect-[3/8] [@container(aspect-ratio<0.75)]:w-[min(100cqw,37.5cqh)] [@container(aspect-ratio<0.75)]:grid-cols-2 [@container(aspect-ratio<0.75)]:grid-rows-4',
        )}
      >
        <svg width="0" height="0" className="absolute" focusable="false">
          <defs>
            <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves="2"
                stitchTiles="stitch"
              />
              <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0" />
            </filter>
            {SPECTRUM.map(({ color }, i) => (
              <linearGradient key={color} id={`${id}-band${String(i)}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={color} stopOpacity="0" />
                <stop offset=".6" stopColor={color} />
              </linearGradient>
            ))}
            <radialGradient id={`${id}-orb`} cx=".45" cy=".4" r=".6">
              <stop offset="0" stopColor={B.mustard} />
              <stop offset=".35" stopColor={B.orange} />
              <stop offset=".7" stopColor={B.pink} />
              <stop offset="1" stopColor={TINT.violet} stopOpacity="0" />
            </radialGradient>
            <clipPath id={`${id}-pill-left`}>
              <rect x="14" y="14" width="40" height="132" rx="20" />
            </clipPath>
            <clipPath id={`${id}-pill-right`}>
              <rect x="66" y="14" width="40" height="132" rx="20" />
            </clipPath>
            <clipPath id={`${id}-square`}>
              <rect x="22" y="42" width="76" height="76" />
            </clipPath>
          </defs>
        </svg>

        {/* 1. Spectrum fan */}
        <Card bg={TINT.night}>
          <g transform="translate(-20 175)">
            {SPECTRUM.map(({ angle }, i) => (
              <rect
                key={angle}
                width="190"
                height="20"
                fill={ref(`band${String(i)}`)}
                transform={`rotate(${String(angle)})`}
              />
            ))}
          </g>
          <rect width="120" height="160" filter={ref('grain')} opacity=".35" />
        </Card>

        {/* 2. Target rings */}
        <Card bg={B.cream}>
          <circle cx="60" cy="80" r="40" fill={B.mustard} />
          <circle cx="60" cy="80" r="28" fill={B.cream} />
          <circle cx="60" cy="80" r="16" fill={B.mustard} />
          <circle cx="60" cy="80" r="6" fill={B.cream} />
        </Card>

        {/* 3. Stacked gradient arcs in two pills */}
        <Card bg={TINT.fog}>
          <g clipPath={ref('pill-left')}>
            {LEFT_ARCS.map((color, i) => (
              <circle key={`l${String(i)}`} cx="34" cy={2 + i * 5.6} r="20" fill={color} />
            ))}
          </g>
          <g clipPath={ref('pill-right')}>
            {RIGHT_ARCS.map((color, i) => (
              <circle key={`r${String(i)}`} cx="86" cy={2 + i * 5.6} r="20" fill={color} />
            ))}
          </g>
        </Card>

        {/* 4. Diamond cluster */}
        <Card bg={B.pink}>
          <g fill={B.red}>
            <path d="M60 38L76 54L60 70L44 54Z" />
            <path d="M60 90L76 106L60 122L44 106Z" />
            <path d="M34 64L50 80L34 96L18 80Z" />
            <path d="M86 64L102 80L86 96L70 80Z" />
          </g>
          <path d="M60 70L70 80L60 90L50 80Z" fill={TINT.white} />
        </Card>

        {/* 5. Glowing orb */}
        <Card bg={TINT.indigoNight}>
          <circle cx="60" cy="84" r="70" fill={ref('orb')} />
          <rect width="120" height="160" filter={ref('grain')} opacity=".4" />
        </Card>

        {/* 6. Subdivided triangle */}
        <Card bg={B.sky}>
          <g fill={B.blue}>
            {TRIANGLES.map(([x, y]) => (
              <path key={`${String(x)}-${String(y)}`} d={`M${String(x)} ${String(y)}l12 21h-24Z`} />
            ))}
          </g>
        </Card>

        {/* 7. Striped square */}
        <Card bg={B.green}>
          <g clipPath={ref('square')} stroke={B.cream} strokeWidth="7">
            {[-30, 0, 30, 60, 90, 120].map((offset) => (
              <line key={offset} x1={22 + offset - 60} y1="118" x2={22 + offset + 60} y2="-2" />
            ))}
          </g>
        </Card>

        {/* 8. Sunburst */}
        <Card bg={B.orange}>
          <g stroke={B.mustard} strokeWidth="5" strokeLinecap="round">
            {RAYS.map((r, i) => (
              <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
            ))}
          </g>
          <circle cx="60" cy="80" r="8" fill={B.cream} />
        </Card>
      </div>
    </div>
  );
}
