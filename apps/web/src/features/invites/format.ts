import { intlLocale } from '@/lib/locale';

const DAY_MS = 24 * 60 * 60 * 1000;
const formats = new Map<string, Intl.RelativeTimeFormat>();

/** "in 7 days", "tomorrow", "today": rounded up, so a link never looks expired early. */
export function expiresIn(expiresAt: string): string {
  const locale = intlLocale();
  let relative = formats.get(locale);
  if (!relative) {
    relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    formats.set(locale, relative);
  }
  const days = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
  return relative.format(days, 'day');
}
