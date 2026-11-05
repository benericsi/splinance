import { i18n } from '@/i18n';
import { intlLocale, localeStore } from '@/lib/locale';

/**
 * Calendar dates (`YYYY-MM-DD`) and months (`YYYY-MM`) in the user's local time zone. Built
 * from parts, never through `new Date('2026-10-10')`, which would mean midnight UTC and show
 * the previous day west of Greenwich.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIsoDate(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export const today = (now = new Date()) => toIsoDate(now);

export const currentMonth = (now = new Date()) => toIsoDate(now).slice(0, 7);

/** `addMonths('2026-01', -1)` is `'2025-12'`. */
export function addMonths(month: string, delta: number): string {
  const [year = 1970, index = 1] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return toIsoDate(date).slice(0, 7);
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** A date in the UI language with the given parts; formatters are cached per locale. */
export function formatDateWith(date: Date, options: Intl.DateTimeFormatOptions): string {
  const locale = intlLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    formats.set(key, format);
  }
  return format.format(date);
}

/** "October 2026" / "2026. október" */
export function formatMonth(month: string): string {
  return formatDateWith(fromIsoDate(`${month}-01`), { month: 'long', year: 'numeric' });
}

/** "10 Oct" / "okt. 10." */
export const formatShortDate = (value: string) =>
  formatDateWith(fromIsoDate(value), { day: 'numeric', month: 'short' });

/**
 * "Today, Fri 10 Oct", "Yesterday, Thu 9 Oct", "Wed 8 Oct", or with the year if not this
 * year. Hungarian: "Ma, okt. 10., péntek", "2025. dec. 31., szerda".
 */
export function formatDayHeading(value: string, now = new Date()): string {
  const date = fromIsoDate(value);
  const sameYear = date.getFullYear() === now.getFullYear();
  let label: string;
  if (localeStore.getState() === 'en') {
    const dayMonth = formatDateWith(date, { weekday: 'short', day: 'numeric', month: 'short' });
    // Appended by hand: with `year`, en-GB adds a comma after the weekday ("Wed, 31 Dec 2025").
    label = sameYear ? dayMonth : `${dayMonth} ${String(date.getFullYear())}`;
  } else {
    label = formatDateWith(date, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      ...(!sameYear && { year: 'numeric' }),
    });
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (value === toIsoDate(now)) return i18n.t('common:date.todayHeading', { date: label });
  if (value === toIsoDate(yesterday)) {
    return i18n.t('common:date.yesterdayHeading', { date: label });
  }
  return label;
}
