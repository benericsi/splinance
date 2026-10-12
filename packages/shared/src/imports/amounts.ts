import { CURRENCIES, type Currency } from '../households';
import { CURRENCY_EXPONENTS } from '../money';

const isCurrency = (code: string): code is Currency =>
  (CURRENCIES as readonly string[]).includes(code);

/** Minor-unit digits of a currency; two for ones the app does not know (most have two). */
export const exponentOf = (currency: string) =>
  isCurrency(currency) ? CURRENCY_EXPONENTS[currency] : 2;

/**
 * A bank export's decimal amount ("-2306.00", "618.96", "420165") in signed minor units,
 * read as text so no float rounding creeps in. More decimals than the currency has (HUF
 * fillér) are rounded half away from zero, the way Hungarian rounding works for forints.
 * Returns undefined for anything that is not a plain decimal number.
 */
export function decimalToMinor(
  text: string,
  currency: string,
): { minor: number; rounded: boolean } | undefined {
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text.replace(/\s/g, ''));
  if (!match?.[2]) return undefined;
  const negative = match[1] === '-';
  const digits = exponentOf(currency);
  const fraction = match[3] ?? '';

  let minor =
    Number(match[2]) * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, '0'));
  const rest = fraction.slice(digits);
  const rounded = /[1-9]/.test(rest);
  if (rest !== '' && Number(rest[0]) >= 5) minor += 1;
  if (!Number.isSafeInteger(minor)) return undefined;
  return { minor: negative ? -minor : minor, rounded };
}

/** Collapses runs of spaces (K&H pads card holds with them) and trims. */
export const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** At most `max` characters, cut at a word when possible. */
export function shorten(text: string, max = 120): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max / 2 ? cut.slice(0, space) : cut}…`;
}
