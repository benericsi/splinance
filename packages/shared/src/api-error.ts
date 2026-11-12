import { z } from 'zod';

/**
 * Every `error.code` the API answers with. The code is the contract: `message` is English
 * for logs and curl, and the web shows its own text for the code in the UI language
 * (`errors` catalogs, checked against this list by a test).
 */
export const API_ERROR_CODES = [
  // Generic
  'VALIDATION_ERROR',
  'BAD_REQUEST',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_FOUND',
  'FORBIDDEN',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'HTTP_ERROR',
  'DEMO_MODE',
  // Auth and account
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'REGISTRATION_CLOSED',
  'EMAIL_TAKEN',
  'WRONG_PASSWORD',
  'WEAK_PASSWORD',
  'REAUTH_REQUIRED',
  'ALREADY_CONNECTED',
  'IDENTITY_NOT_FOUND',
  'LAST_SIGN_IN_METHOD',
  'PROVIDER_UNAVAILABLE',
  'CONFIRMATION_MISMATCH',
  // Households and invites
  'HOUSEHOLD_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'LAST_OWNER',
  'CANNOT_REMOVE_SELF',
  'UNSETTLED_BALANCE',
  'INVITE_NOT_FOUND',
  'INVITE_REVOKED',
  'INVITE_USED',
  'INVITE_EXPIRED',
  'ALREADY_MEMBER',
  // Money
  'CATEGORY_NOT_FOUND',
  'CATEGORY_NAME_TAKEN',
  'INVALID_CATEGORY',
  'INVALID_MEMBER',
  'TRANSACTION_NOT_FOUND',
  'VERSION_CONFLICT',
  'SETTLEMENT_NOT_FOUND',
  'SAVINGS_GOAL_NOT_FOUND',
  'SAVINGS_ENTRY_NOT_FOUND',
  'SAVINGS_GOAL_ARCHIVED',
  'INSUFFICIENT_SAVINGS',
  'RULE_NOT_FOUND',
  'RULE_PATTERN_TAKEN',
  'RULE_ORDER_MISMATCH',
  'IMPORT_NOT_FOUND',
  'IMPORT_CONFLICT',
  'NOTHING_TO_IMPORT',
  'ALREADY_IMPORTED',
  'SERIES_NOT_FOUND',
  'SERIES_PATTERN_TAKEN',
  'SUGGESTION_NOT_FOUND',
  'RECURRING_LIMIT',
  'INVALID_START',
  // Demo
  'DEMO_NOT_FOUND',
  'DEMO_CAPACITY',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Shape of every non-2xx JSON response from the API. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
