import {
  CURRENCY_EXPONENTS,
  type Currency,
  MAX_AMOUNT_MINOR,
  PERCENT_SCALE,
} from '@splinance/shared';

/**
 * Amounts use Hungarian number formatting ("10 001 Ft", "12,50 €") whatever the UI
 * language: that is how the people using it read money. Hungarian groups digits only from
 * five digits on ("2500 Ft", "10 001 Ft"). Formatters are cached per options.
 */
const LOCALE = 'hu-HU';
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: Currency, style: 'currency' | 'decimal', signed: boolean) {
  const key = `${currency}:${style}:${String(signed)}`;
  let cached = formatters.get(key);
  if (!cached) {
    const digits = CURRENCY_EXPONENTS[currency];
    cached = new Intl.NumberFormat(LOCALE, {
      style,
      // narrowSymbol: "€" rather than "EUR" (hu-HU writes the code by default).
      ...(style === 'currency' && { currency, currencyDisplay: 'narrowSymbol' }),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    formatters.set(key, cached);
  }
  return cached;
}

const toMajor = (minor: number, currency: Currency) => minor / 10 ** CURRENCY_EXPONENTS[currency];

/** "10 001 Ft". With `signed`, a sign for anything but zero: "-10 001 Ft", "+420 000 Ft". */
export function formatMoney(minor: number, currency: Currency, { signed = false } = {}): string {
  return formatter(currency, 'currency', signed).format(toMajor(minor, currency));
}

/** The number alone, for prefilling an amount input: "10 001", "12,50". */
export function formatAmountInput(minor: number, currency: Currency): string {
  return formatter(currency, 'decimal', false).format(toMajor(minor, currency));
}

/** The currency's symbol as the formatter writes it ("Ft", "€"). */
export function currencySymbol(currency: Currency): string {
  return (
    formatter(currency, 'currency', false)
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency
  );
}

/**
 * Reads what people type: "10001", "10 001", "10,001" and "10.001" are all ten thousand
 * and one forints; for euros "12,50", "12.5" and "1.234,56" work too. The last separator
 * counts as the decimal point only when the currency has decimals and at most that many
 * digits follow it; any other separators must group thousands. Returns minor units, or
 * undefined for anything else (letters, too many decimals, zero, too large).
 */
export function parseAmount(text: string, currency: Currency): number | undefined {
  const digits = CURRENCY_EXPONENTS[currency];
  const value = text.replace(/\s/g, '');

  let whole = value;
  let fraction = '';
  if (digits > 0) {
    const decimal = new RegExp(`^(.*)[.,](\\d{1,${String(digits)}})$`).exec(value);
    if (decimal?.[1] !== undefined && decimal[2] !== undefined) {
      whole = decimal[1] || '0';
      fraction = decimal[2];
    }
  }
  if (!/^\d+$/.test(whole) && !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return undefined;

  const minor =
    Number(whole.replace(/[.,]/g, '')) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : undefined;
}

/** Whole-unit digits accepted while typing: MAX_AMOUNT_MINOR (10^12) has 13. */
const MAX_WHOLE_DIGITS = 13;

const wholeFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/**
 * Formats an amount while it is typed: "100000000" shows as "100 000 000", the same
 * grouping as everywhere else. Letters never get in. Spaces and separators people type
 * are dropped and regrouped; for currencies with decimals the last `.` or `,` is the
 * decimal comma ("12.5" -> "12,5") and extra decimals are cut. Validation stays with
 * `parseAmount`, which reads the result.
 */
export function formatAmountTyping(text: string, currency: Currency): string {
  const decimals = CURRENCY_EXPONENTS[currency];
  const cleaned = text.replace(/[^\d.,]/g, '');

  let whole = cleaned;
  let fraction: string | undefined;
  const separator =
    decimals > 0 ? Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(',')) : -1;
  if (separator !== -1) {
    whole = cleaned.slice(0, separator);
    fraction = cleaned.slice(separator + 1).slice(0, decimals);
  }
  whole = whole
    .replace(/[.,]/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, MAX_WHOLE_DIGITS);

  const grouped = whole === '' ? '' : wholeFormatter.format(BigInt(whole));
  return fraction === undefined ? grouped : `${grouped || '0'},${fraction}`;
}

/**
 * Where the caret belongs after `formatAmountTyping`: behind the same number of digits
 * (and decimal separator) as before, so inserted grouping spaces do not move it.
 */
export function caretAfterFormat(
  raw: string,
  caret: number,
  formatted: string,
  currency: Currency,
): number {
  const decimals = CURRENCY_EXPONENTS[currency];
  const significant = (char: string) => /\d/.test(char) || (decimals > 0 && /[.,]/.test(char));
  let count = 0;
  for (let i = 0; i < caret && i < raw.length; i++) {
    if (significant(raw.charAt(i))) count++;
  }
  if (count === 0) return 0;
  for (let i = 0; i < formatted.length; i++) {
    if (significant(formatted.charAt(i)) && --count === 0) return i + 1;
  }
  return formatted.length;
}

/** Same for percentages: digits, a decimal separator and an optional `%`. */
export function sanitizePercentInput(text: string): string {
  return text.replace(/[^\d.,%\s]/g, '').slice(0, 8);
}

/** "60", "33.33" or "33,33" (percent, up to two decimals) to basis points; undefined if invalid. */
export function parsePercent(text: string): number | undefined {
  const value = text.replace(/\s|%/g, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return undefined;
  const basisPoints = Math.round(Number(value) * 100);
  return basisPoints > 0 && basisPoints <= PERCENT_SCALE ? basisPoints : undefined;
}

/** Basis points as an editable percentage: 6000 -> "60", 3333 -> "33,33". */
export function formatPercentInput(basisPoints: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, useGrouping: false }).format(
    basisPoints / 100,
  );
}
