import { useSyncExternalStore } from 'react';

/**
 * "Hide amounts" for screen sharing or a look over the shoulder: every amount on the page
 * blurs (`[data-amount]`, see index.css) while the numbers stay in the DOM, so layout,
 * screen readers and the sr-only copies are unchanged. A device setting like the theme:
 * it is about who can see this screen, not about the account.
 */
export const HIDE_AMOUNTS_STORAGE_KEY = 'splinance-hide-amounts';
/** On <html> while amounts are hidden. */
export const HIDE_AMOUNTS_CLASS = 'hide-amounts';

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_AMOUNTS_STORAGE_KEY) === 'true';
  } catch {
    // Storage blocked (private mode): shown, and a toggle still works for this visit.
    return false;
  }
}

function apply(hidden: boolean) {
  document.documentElement.classList.toggle(HIDE_AMOUNTS_CLASS, hidden);
}

function createHideAmountsStore() {
  let hidden = readHidden();
  const listeners = new Set<() => void>();
  // Applied on import, which happens before the first render (main.tsx awaits the router),
  // so a reload never flashes the numbers.
  apply(hidden);

  return {
    getState: () => hidden,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setHidden: (next: boolean) => {
      try {
        localStorage.setItem(HIDE_AMOUNTS_STORAGE_KEY, String(next));
      } catch {
        // Not persisted, but still applied for this visit.
      }
      apply(next);
      if (next === hidden) return;
      hidden = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}

export const hideAmountsStore = createHideAmountsStore();

export function useHideAmounts(): boolean {
  return useSyncExternalStore(hideAmountsStore.subscribe, hideAmountsStore.getState);
}
