import { useSyncExternalStore } from 'react';

/** Chromium's install event; not in TypeScript's DOM types. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
}

let captured: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(next: BeforeInstallPromptEvent | null) {
  captured = next;
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Chromium fires `beforeinstallprompt` once, early, whatever is on screen, so this runs at
 * boot (main.tsx). Returns the cleanup for tests.
 */
export function watchInstallPrompt(): () => void {
  const onPrompt = (event: Event) => {
    // Keeps the browser's own banner away: the account menu offers it instead.
    event.preventDefault();
    set(event as BeforeInstallPromptEvent);
  };
  const onInstalled = () => {
    set(null);
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
    set(null);
  };
}

/** Shows the browser's install dialog; it can only be used once. */
export async function promptInstall(): Promise<void> {
  const event = captured;
  set(null);
  await event?.prompt();
}

/** Already running as the installed app. */
function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** iOS has no install event: people add the page from the share sheet themselves. */
function isIos(): boolean {
  // iPadOS asks for desktop sites and says it is a Mac; only touch gives it away.
  const iPadAsMac = navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || iPadAsMac;
}

export type InstallMethod = 'prompt' | 'ios-sheet' | null;

/** How this browser can install the app right now, if at all. */
export function useInstallMethod(): InstallMethod {
  const event = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => captured,
  );
  if (isStandalone()) return null;
  if (event) return 'prompt';
  return isIos() ? 'ios-sheet' : null;
}
