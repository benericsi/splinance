import type { Transaction } from '@splinance/shared';
import { foreignKey, index, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns';
import { auditAction, auditEntity } from './enums';
import { householdMembers } from './household-members';

/**
 * Append-only history of changes, written in the same database transaction as the change.
 * `before` and `after` hold the API representation of the entity: `before` is null for
 * create, `after` is null for delete.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    householdId: uuid().notNull(),
    actorId: uuid().notNull(),
    entity: auditEntity().notNull(),
    entityId: uuid().notNull(),
    action: auditAction().notNull(),
    before: jsonb().$type<Transaction>(),
    after: jsonb().$type<Transaction>(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'audit_log_actor_member_fk',
      columns: [t.householdId, t.actorId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    index('audit_log_entity_idx').on(t.entity, t.entityId, t.createdAt),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
