import {
  AUDIT_ACTIONS,
  CATEGORY_KINDS,
  CURRENCIES,
  HOUSEHOLD_ROLES,
  SPLIT_METHODS,
  TRANSACTION_VISIBILITIES,
} from '@splinance/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

// Generated from the shared `as const` arrays: one source of truth for DB, Zod and UI labels.
export const currency = pgEnum('currency', CURRENCIES);
export const householdRole = pgEnum('household_role', HOUSEHOLD_ROLES);
/** Also the type of transactions.kind, so the category foreign key can include the kind. */
export const categoryKind = pgEnum('category_kind', CATEGORY_KINDS);
export const transactionVisibility = pgEnum('transaction_visibility', TRANSACTION_VISIBILITIES);
export const splitMethod = pgEnum('split_method', SPLIT_METHODS);
export const auditAction = pgEnum('audit_action', AUDIT_ACTIONS);
export const auditEntity = pgEnum('audit_entity', ['transaction']);
