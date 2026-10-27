import { createContext, useContext } from 'react';
import { COLLAPSE, REVEAL, REVEAL_MAX_ROWS, REVEAL_ROW_STAGGER, TRANSITION } from './motion';

/**
 * Skeletons and the entrance that replaces them (components in `components/reveal.tsx`).
 * Content only animates in when a skeleton was on screen before it: a page that comes from
 * the cache appears at once, so there are still no page transitions.
 *
 * The skeleton (a route's pendingComponent) and the page are never mounted together, so
 * they meet through a module flag: the skeleton sets it, the next page to mount reads it.
 */
let skeletonShown = false;

export const skeletonFlag = {
  set: (value: boolean) => {
    skeletonShown = value;
  },
  get: () => skeletonShown,
};

export interface RevealState {
  /** True while the page that replaced a skeleton is coming in. */
  active: boolean;
  /** Seconds the enclosing section waits, so its rows and bars follow it. */
  delay: number;
}

export const RevealContext = createContext<RevealState>({ active: false, delay: 0 });

export function useReveal(): RevealState {
  return useContext(RevealContext);
}

/**
 * Motion props for the rows of an animated list. While the page reveals, rows come in one
 * after another (pair with `<AnimatePresence initial={active}>`); afterwards they open and
 * close by height (`COLLAPSE`).
 */
export function useRevealRows() {
  const { active, delay } = useContext(RevealContext);
  return {
    active,
    rowProps: (index: number) =>
      active
        ? {
            initial: REVEAL.initial,
            animate: {
              ...REVEAL.animate,
              transition: {
                ...TRANSITION,
                delay: delay + Math.min(index, REVEAL_MAX_ROWS) * REVEAL_ROW_STAGGER,
              },
            },
            exit: COLLAPSE.exit,
          }
        : COLLAPSE,
  };
}
