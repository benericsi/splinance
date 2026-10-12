import type { Transition } from 'motion/react';

/**
 * Motion tokens. Short and decelerating, the same curve as the drawer (Base UI CSS), so
 * JavaScript and CSS animations feel like one system.
 */
export const EASE_OUT = [0.32, 0.72, 0, 1] as const;

export const TRANSITION: Transition = { duration: 0.2, ease: EASE_OUT };

/** For swaps (collapsed summary <-> editor): two in a row, so each half is quicker. */
export const TRANSITION_FAST: Transition = { duration: 0.15, ease: EASE_OUT };

/**
 * Height and opacity for content that opens, closes, appears or disappears in a list.
 * `overflow` is hidden only while animating, so focus rings are not clipped afterwards.
 */
export const COLLAPSE = {
  initial: { height: 0, opacity: 0, overflow: 'hidden' },
  animate: { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } },
  exit: { height: 0, opacity: 0, overflow: 'hidden' },
} as const;
