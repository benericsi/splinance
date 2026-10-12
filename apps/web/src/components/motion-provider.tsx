import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { TRANSITION } from '@/lib/motion';

/**
 * App-wide motion setup. `LazyMotion` with `domAnimation` (no layout animations) keeps the
 * bundle small, and loads it as its own chunk after first paint: until then `m.*` elements
 * render in their final state without animating. `strict` makes using the full `motion.*`
 * components an error; use `m.*`.
 * `reducedMotion="user"` follows the OS setting: transforms and size changes are skipped,
 * only opacity still fades.
 */
const loadFeatures = () => import('@/lib/motion-features').then((module) => module.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={TRANSITION}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
