import { z } from 'zod';
import type { Currency } from './households';

/** Digits after the decimal point. HUF has no fillér in practice, so amounts are whole forints. */
export const CURRENCY_EXPONENTS: Record<Currency, number> = { HUF: 0, EUR: 2 };

/**
 * Upper bound for any amount in minor units (10^12: a trillion forints, ten billion euros).
 * Far beyond real household spending, and small enough that sums of many amounts stay exact
 * as JavaScript numbers (Number.MAX_SAFE_INTEGER is about 9 * 10^15).
 */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

/** A positive amount in minor units: always an integer, never a float. */
export const amountMinorSchema = z
  .number()
  .int('Amount must be a whole number of minor units')
  .positive('Amount must be greater than zero')
  .max(MAX_AMOUNT_MINOR, 'Amount is too large');
