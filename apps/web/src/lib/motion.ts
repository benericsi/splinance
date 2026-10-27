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

/**
 * Entrance for content that replaces a skeleton: fades in and rises 6px. Sections follow
 * each other by `REVEAL_STAGGER`, list rows by `REVEAL_ROW_STAGGER` (only the first
 * `REVEAL_MAX_ROWS`, so long lists do not trickle in).
 */
export const REVEAL = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
} as const;

export const REVEAL_STAGGER = 0.04;
export const REVEAL_ROW_STAGGER = 0.025;
export const REVEAL_MAX_ROWS = 8;

/** Bars grow a little slower than things fade, so the growth reads as movement. */
export const TRANSITION_GROW: Transition = { duration: 0.45, ease: EASE_OUT };

/** How long after a page mounts rows still count as revealed rather than added. */
export const REVEAL_WINDOW_MS = 600;
