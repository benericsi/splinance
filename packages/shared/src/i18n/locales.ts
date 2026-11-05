import { z } from 'zod';

/** UI languages. Also the Postgres enum `locale` (`users.locale`). */
export const LOCALES = ['en', 'hu'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

/** The language everything falls back to, and the one the API speaks. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language named in itself, for the switch ("English", "Magyar"). */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', hu: 'Magyar' };

/**
 * The supported language a BCP 47 tag asks for ("hu-HU" -> "hu"), or undefined. Used for the
 * browser's languages and anything else that names a language from outside.
 */
export function matchLocale(tag: string | null | undefined): Locale | undefined {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.find((locale) => locale === base);
}
