import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns';
import { households } from './households';
import { users } from './users';

/**
 * One "Try the demo" sandbox on the demo instance: the visitor, the made-up partner and the
 * household seeded from the demo story. Expired sandboxes are deleted with everything in
 * them. On production this table stays empty.
 */
export const demos = pgTable(
  'demos',
  {
    id: id(),
    userId: uuid().notNull(),
    partnerId: uuid().notNull(),
    // Set once the household is seeded; null only while seeding runs.
    householdId: uuid(),
    // With anchor_on, rebuilds the story (and its bank files) exactly.
    seed: integer().notNull(),
    // The day the story ends on: the visitor's "today" when the demo started.
    anchorOn: date({ mode: 'string' }).notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: 'demos_user_id_fk', columns: [t.userId], foreignColumns: [users.id] }),
    foreignKey({ name: 'demos_partner_id_fk', columns: [t.partnerId], foreignColumns: [users.id] }),
    foreignKey({
      name: 'demos_household_id_fk',
      columns: [t.householdId],
      foreignColumns: [households.id],
    }),
    unique('demos_user_id_unique').on(t.userId),
    index('demos_expires_at_idx').on(t.expiresAt),
    check('demos_seed_non_negative', sql`${t.seed} >= 0`),
    check('demos_people_differ', sql`${t.userId} <> ${t.partnerId}`),
  ],
);

export type DemoRow = typeof demos.$inferSelect;
