import { i18n } from '@/i18n';
import { intlLocale } from '@/lib/locale';

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** "5 Nov 2026" / "2026. nov. 5.", in the UI language. */
export function formatDate(iso: string): string {
  const locale = intlLocale();
  let format = dateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    dateFormats.set(locale, format);
  }
  return format.format(new Date(iso));
}

/** "today", "yesterday" or the date: enough to spot a sign-in you do not recognize. */
export function formatLastUsed(iso: string, now = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day(now).getTime() - day(new Date(iso)).getTime()) / 86_400_000);
  if (days <= 0) return i18n.t('date.today');
  if (days === 1) return i18n.t('date.yesterday');
  return formatDate(iso);
}
