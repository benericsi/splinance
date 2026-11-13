import { m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { arcFill, gaugeGeometry, ringGeometry } from '@/lib/arc';
import { TRANSITION, TRANSITION_GROW } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';

const GAUGE = gaugeGeometry(120, 12);
const RING = ringGeometry(64, 7);

/**
 * The fill of an arc: grows from nothing once when its page replaces a skeleton (not with
 * reduced motion: `pathLength` is not a transform, so MotionConfig would not skip it), and
 * eases to new values. Nothing at all at 0, where a round cap would still draw a dot.
 */
function useArcMotion(fill: number) {
  const reveal = useReveal();
  const reducedMotion = useReducedMotion();
  const grow = reveal.active && !reducedMotion;
  return {
    initial: grow ? { pathLength: 0, opacity: 0 } : false,
    animate: { pathLength: fill, opacity: fill > 0 ? 1 : 0 },
    transition: grow ? { ...TRANSITION_GROW, delay: reveal.delay + 0.1 } : TRANSITION,
  } as const;
}

/**
 * A half circle filled to `ratio` (clamped at full), with `children` (a short label, never
 * an amount: SVG text cannot carry the hide amounts mark, so the label is HTML) in its
 * middle. Decorative: the text next to it says the same in words.
 */
export function Gauge({
  ratio,
  className,
  strokeClassName,
  children,
}: {
  ratio: number;
  className?: string;
  /** The fill's stroke color, e.g. `stroke-brand-mustard`. */
  strokeClassName: string;
  children?: ReactNode;
}) {
  const motion = useArcMotion(arcFill(ratio));
  return (
    <div className={cn('relative', className)} aria-hidden>
      <svg viewBox={GAUGE.viewBox} className="block w-full overflow-visible">
        <path
          d={GAUGE.d}
          fill="none"
          strokeWidth={12}
          strokeLinecap="round"
          className="stroke-muted"
        />
        <m.path
          d={GAUGE.d}
          fill="none"
          strokeWidth={12}
          strokeLinecap="round"
          className={strokeClassName}
          {...motion}
        />
      </svg>
      {children && (
        <div className="absolute inset-x-0 bottom-0 text-center leading-none">{children}</div>
      )}
    </div>
  );
}

/** A full circle filled to `ratio`, with a short label in the middle. Decorative, like `Gauge`. */
export function Ring({
  ratio,
  className,
  strokeClassName,
  children,
}: {
  ratio: number;
  className?: string;
  strokeClassName: string;
  children?: ReactNode;
}) {
  const motion = useArcMotion(arcFill(ratio));
  return (
    <div className={cn('relative', className)} aria-hidden>
      {/* Starts at the top and runs clockwise. */}
      <svg viewBox={RING.viewBox} className="block size-full -rotate-90">
        <circle
          cx={RING.center}
          cy={RING.center}
          r={RING.r}
          fill="none"
          strokeWidth={7}
          className="stroke-muted"
        />
        <m.circle
          cx={RING.center}
          cy={RING.center}
          r={RING.r}
          fill="none"
          strokeWidth={7}
          strokeLinecap="round"
          className={strokeClassName}
          {...motion}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center leading-none">
          {children}
        </div>
      )}
    </div>
  );
}
