import { z } from 'zod';
import { currencySchema } from './households';
import { personSchema, transactionKindSchema } from './transactions';

/**
 * Two families. State ones say how things stand (a renewal is coming, a budget is nearly
 * spent) and are kept in line with it by the server's sync: they resolve on their own.
 * Activity ones say what someone else did to money you are part of; they are written in
 * the same database transaction as the change.
 */
export const STATE_NOTIFICATION_TYPES = [
  'renewal_due',
  'renewal_missed',
  'price_changed',
  'budget_near',
  'budget_over',
] as const;

export const ACTIVITY_NOTIFICATION_TYPES = [
  'tx_added',
  'tx_changed',
  'tx_deleted',
  'import_added',
  'settlement_recorded',
] as const;

export const NOTIFICATION_TYPES = [
  ...STATE_NOTIFICATION_TYPES,
  ...ACTIVITY_NOTIFICATION_TYPES,
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** What the actor did, for activity: a restore reads differently from a create. */
export const NOTIFICATION_ACTIONS = ['create', 'update', 'delete', 'restore', 'undo'] as const;
export const notificationActionSchema = z.enum(NOTIFICATION_ACTIONS);
export type NotificationAction = z.infer<typeof notificationActionSchema>;

/** A renewal notifies this many days before its payment is due. */
export const RENEWAL_LEAD_DAYS = 3;

/** The newest notifications a person gets in one list (older ones are pruned anyway). */
export const NOTIFICATION_LIST_LIMIT = 50;

/**
 * One notification as its reader sees it. Rows hold only ids and numbers; names come from
 * the current data when the list is read (a renamed series renames its notifications, and
 * nothing is shown that the reader could not see in the app).
 */
export const notificationSchema = z.object({
  id: z.uuid(),
  householdId: z.uuid(),
  householdName: z.string(),
  type: notificationTypeSchema,
  action: notificationActionSchema.nullable(),
  /** Who did it (activity only). */
  actor: personSchema.nullable(),
  /** The series, category, transaction, import or settlement it is about. */
  subjectId: z.uuid(),
  /** The series' or category's name, or the transaction's description. */
  subjectName: z.string().nullable(),
  /**
   * For a recurring series: whether it is a payment or income, so "missed" and "changed"
   * read right ("did not arrive", "came in higher"). Null for every other subject.
   */
  subjectKind: transactionKindSchema.nullable(),
  /** A settlement's two people (`settlement_recorded` only). */
  parties: z.object({ from: personSchema, to: personSchema }).nullable(),
  /** The renewal's payment date, or the budget's month (its first day). */
  dueOn: z.iso.date().nullable(),
  /** The amount it is about: a payment, the reader's share, a budget's spending. */
  amount: z.number().int().nullable(),
  /** The amount before: the previous price, the share before an edit, the budget's limit. */
  previousAmount: z.number().int().nullable(),
  /** How many transactions an import added that involve the reader. */
  count: z.number().int().nullable(),
  currency: currencySchema,
  createdAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  /** A state notification that no longer holds (paid, a new month). */
  resolvedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  /** Unread and still holding: the badge. */
  unread: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const unreadCountResponseSchema = z.object({ unread: z.number().int().nonnegative() });
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

/** Marks some (opened ones) or all of the reader's notifications read. */
export const markNotificationsReadInputSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadInputSchema>;

/** Per household: whether to hear about what others do (activity notifications). */
export const notificationSettingsSchema = z.object({ activity: z.boolean() });
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const notificationSettingsResponseSchema = z.object({
  settings: notificationSettingsSchema,
});
export type NotificationSettingsResponse = z.infer<typeof notificationSettingsResponseSchema>;
