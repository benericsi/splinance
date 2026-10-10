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

/** Longest amount text worth typing: 10^12 with grouping spaces and decimals fits easily. */
export const AMOUNT_INPUT_MAX_LENGTH = 20;

/**
 * Keeps only what an amount can contain (digits, spaces, `.` and `,`) while typing, so
 * letters never reach the field. Validation (`parseAmount`) still decides what is valid.
 */
export function sanitizeAmountInput(text: string): string {
  return text.replace(/[^\d\s.,]/g, '').slice(0, AMOUNT_INPUT_MAX_LENGTH);
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
