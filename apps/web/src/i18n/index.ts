import { DEFAULT_LOCALE, type Locale } from '@splinance/shared';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import type { Catalog } from './types';

export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];

/**
 * The app's one i18next instance. English is bundled and initialized synchronously, so the
 * first render (and every test) has its strings; other languages are their own chunk,
 * loaded by `loadCatalog` before the language switches (lib/locale.ts), never while a page
 * is on screen in a half-loaded language.
 */
export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources: { en },
  ns: NAMESPACES,
  defaultNS: 'common',
  initAsync: false,
  // React escapes every string it renders; escaping here too would show "&amp;".
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** A literal map, so a language is never a path built from input. */
const CATALOGS: Record<Exclude<Locale, 'en'>, () => Promise<{ hu: Catalog }>> = {
  hu: () => import('./locales/hu'),
};

/** Loads a language's strings once; English is always there. */
export async function loadCatalog(locale: Locale): Promise<void> {
  if (locale === 'en' || i18n.hasResourceBundle(locale, 'common')) return;
  const catalog = (await CATALOGS[locale]())[locale];
  for (const [namespace, resources] of Object.entries(catalog)) {
    i18n.addResourceBundle(locale, namespace, resources);
  }
}
