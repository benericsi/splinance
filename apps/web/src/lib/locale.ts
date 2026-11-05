import {
  DEFAULT_LOCALE,
  type Locale,
  LOCALES,
  matchLocale,
  setValidationLocale,
} from '@splinance/shared';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import zodEn from 'zod/v4/locales/en.js';
import { i18n, loadCatalog } from '@/i18n';
import type { AuthStore } from './auth-store';

// Keep in sync with the inline script in index.html, which sets <html lang> before first paint.
export const LOCALE_STORAGE_KEY = 'splinance-locale';

/** Locale tags for Intl: dates and relative times follow the UI language. */
export const INTL_LOCALES: Record<Locale, string> = { en: 'en-GB', hu: 'hu-HU' };

/** Zod's own messages (for checks without a message of ours), loaded with the language. */
const ZOD_LOCALES: Record<Locale, () => Promise<() => Partial<z.core.$ZodConfig>>> = {
  en: () => Promise.resolve(zodEn),
  hu: () => import('zod/v4/locales/hu.js').then((module) => module.default),
};

function readStored(): Locale | undefined {
  try {
    return matchLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    // Storage can be blocked: the browser's languages decide.
    return undefined;
  }
}

/**
 * The language for a visit before anyone signed in: this device's last choice, else the
 * first of the browser's languages we have, else English. A signed-in user's saved
 * language wins over this once the session is restored (`followUserLocale`).
 */
export function detectLocale(): Locale {
  const fromBrowser = (navigator.languages.length ? navigator.languages : [navigator.language])
    .map(matchLocale)
    .find((locale) => locale !== undefined);
  return readStored() ?? fromBrowser ?? DEFAULT_LOCALE;
}

function createLocaleStore() {
  let locale: Locale = DEFAULT_LOCALE;
  let pending: Locale | undefined;
  const listeners = new Set<() => void>();

  const apply = (next: Locale, zodLocale: () => Partial<z.core.$ZodConfig>) => {
    void i18n.changeLanguage(next);
    setValidationLocale(next);
    z.config(zodLocale());
    document.documentElement.lang = next;
    if (next === locale) return;
    locale = next;
    listeners.forEach((listener) => {
      listener();
    });
  };

  return {
    getState: () => locale,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * Loads the language's strings, then switches everything at once: i18next, the shared
     * schemas' messages, Zod's messages and <html lang>. `persist` remembers it on this
     * device (the boot detection itself does not). The last call wins if two overlap.
     */
    async setLocale(next: Locale, { persist = true }: { persist?: boolean } = {}) {
      if (persist) {
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, next);
        } catch {
          // Not remembered on this device, still applied for this visit.
        }
      }
      pending = next;
      const [zodLocale] = await Promise.all([ZOD_LOCALES[next](), loadCatalog(next)]);
      if (pending === next) apply(next, zodLocale);
    },
  };
}

export const localeStore = createLocaleStore();

export function useLocale(): Locale {
  return useSyncExternalStore(localeStore.subscribe, localeStore.getState);
}

/** The current language's Intl tag, for formatters outside React. */
export const intlLocale = (locale = localeStore.getState()) => INTL_LOCALES[locale];

/**
 * A signed-in user's saved language wins: after the session is restored, after a login,
 * and when a refresh brings a choice made on another device. Returns the promise of the
 * switch it started (boot awaits it behind the splash), if any.
 */
export function followUserLocale(auth: AuthStore): Promise<void> {
  const sync = () => {
    const saved = auth.getState().user?.locale;
    return saved && saved !== localeStore.getState() ? localeStore.setLocale(saved) : undefined;
  };
  auth.subscribe(() => {
    void sync();
  });
  return sync() ?? Promise.resolve();
}

export const isLocale = (value: unknown): value is Locale =>
  LOCALES.some((locale) => locale === value);
