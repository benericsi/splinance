import { intlLocale } from '@/lib/locale';

const DAY_MS = 86_400_000;
const formats = new Map<string, Intl.RelativeTimeFormat>();

/** "today", "tomorrow", "in 6 days": when a sandbox expiring at `expiresAt` is deleted. */
export function deletedWhen(expiresAt: string, now = new Date()): string {
  const days = Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS));
  const locale = intlLocale();
  let relative = formats.get(locale);
  if (!relative) {
    relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    formats.set(locale, relative);
  }
  return relative.format(days, 'day');
}
