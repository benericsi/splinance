import { ACTIVITY_NOTIFICATION_TYPES } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamptz } from './columns';
import { notificationAction, notificationType } from './enums';
import { householdMembers } from './household-members';

const activityTypes = sql.raw(ACTIVITY_NOTIFICATION_TYPES.map((type) => `'${type}'`).join(', '));

/**
 * One notification for one person (the bell). Only ids and numbers: names are read from
 * the current data when the list is read, so nothing here goes stale or holds text that
 * would need erasing. State rows are kept in line by `syncNotifications` (deduplicated by
 * `dedupe_key`, resolved when they no longer hold); activity rows are written with the
 * change and fold into one unread row per subject.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid().notNull(),
    householdId: uuid().notNull(),
    type: notificationType().notNull(),
    action: notificationAction(),
    /** Who did it (activity only). */
    actorId: uuid(),
    /** The series, category, transaction, import batch or settlement; no FK (like audit_log). */
    subjectId: uuid().notNull(),
    dueOn: date({ mode: 'string' }),
    amount: bigint({ mode: 'number' }),
    previousAmount: bigint({ mode: 'number' }),
    count: integer(),
    /** State rows only: one row per user and fact (`renewal_due:<series>:<date>`). */
    dedupeKey: text(),
    /** Moved forward when an unread activity row folds in a newer change. */
    createdAt: timestamptz().notNull().defaultNow(),
    readAt: timestamptz(),
    resolvedAt: timestamptz(),
  },
  (t) => [
    foreignKey({
      name: 'notifications_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // A null actor skips the check (MATCH SIMPLE): state rows.
    foreignKey({
      name: 'notifications_actor_member_fk',
      columns: [t.householdId, t.actorId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // NULLs are distinct, so activity rows (no key) never collide here.
    uniqueIndex('notifications_user_dedupe_unique').on(t.userId, t.dedupeKey),
    // One unread activity row per person and subject: later changes fold into it.
    uniqueIndex('notifications_activity_unread_unique')
      .on(t.userId, t.subjectId)
      .where(sql`${t.readAt} is null and ${t.type} in (${activityTypes})`),
    index('notifications_user_created_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('notifications_household_idx').on(t.householdId),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
