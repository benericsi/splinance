import { formatDateWith, fromIsoDate } from '@/features/transactions/dates';
import { localeStore } from '@/lib/locale';

const monthDate = (month: string) => fromIsoDate(`${month}-01`);

/** "Oct" / "okt.", for chart axes. */
export function shortMonth(month: string): string {
  return formatDateWith(monthDate(month), { month: 'short' });
}

const ranges = new Map<string, Intl.DateTimeFormat>();

/**
 * "May – Oct 2026", or "Nov 2025 – Apr 2026" across a new year; Hungarian "2026. máj.–okt.".
 * `formatRange` writes the shared year once, in each language's own order.
 */
export function formatMonthRange(from: string, to: string): string {
  const locale = localeStore.getState();
  let format = ranges.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-GB', {
      month: 'short',
      year: 'numeric',
    });
    ranges.set(locale, format);
  }
  // Intl puts thin spaces around the dash; plain ones match the rest of the page.
  return format.formatRange(monthDate(from), monthDate(to)).replace(/\u2009/g, ' ');
}

// en-US: "120K", "1.3M" (en-GB writes a lowercase "1.3m"); Hungarian: "120 E", "1,3 M".
const compacts = {
  en: new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }),
  hu: new Intl.NumberFormat('hu-HU', { notation: 'compact', maximumFractionDigits: 1 }),
};

/** "120K", for axis ticks (major units). */
export const compactNumber = (value: number) => compacts[localeStore.getState()].format(value);
