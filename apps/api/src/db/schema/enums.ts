import { CURRENCIES, HOUSEHOLD_ROLES } from '@splinance/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

// Generated from the shared `as const` arrays: one source of truth for DB, Zod and UI labels.
export const currency = pgEnum('currency', CURRENCIES);
export const householdRole = pgEnum('household_role', HOUSEHOLD_ROLES);
