import { daysBetween, type Notification } from '@splinance/shared';
import { formatMonth, fromIsoDate } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';

/** A notification in words: a bold lead (a name), the rest of the sentence, a detail line. */
export interface Described {
  lead: string;
  rest: string;
  detail: string;
}

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** "today", "tomorrow", "on Thursday", "on 12 Nov". */
function when(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  const date = fromIsoDate(dueOn);
  if (days < 7) return `on ${date.toLocaleDateString('en-GB', { weekday: 'long' })}`;
  return `on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

const shortDay = (value: string) =>
  fromIsoDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * The sentence for a notification as `viewerId` reads it on `today`. Names come from the
 * API (current data); amounts are the reader's (their share, or the household's budget).
 */
export function describeNotification(n: Notification, viewerId: string, today: string): Described {
  const money = (minor: number | null) => formatMoney(minor ?? 0, n.currency);
  const name = n.subjectName ?? 'A payment';
  const actor = n.actor?.displayName ?? 'Someone';

  switch (n.type) {
    case 'renewal_due':
      return {
        lead: name,
        rest: ` renews ${n.dueOn ? when(n.dueOn, today) : 'soon'}`,
        detail: n.resolvedAt ? 'Paid' : money(n.amount),
      };
    case 'renewal_missed':
      return {
        lead: name,
        rest: ' was not paid',
        detail: n.dueOn ? `Expected ${shortDay(n.dueOn)}. Cancelled?` : 'Cancelled?',
      };
    case 'price_changed': {
      const previous = n.previousAmount ?? 0;
      const amount = n.amount ?? 0;
      const percent = previous > 0 ? Math.round((Math.abs(amount - previous) / previous) * 100) : 0;
      return {
        lead: name,
        rest: ` price went ${amount > previous ? 'up' : 'down'} ${String(percent)}%`,
        detail: `${money(previous)} to ${money(amount)}`,
      };
    }
    case 'budget_near':
    case 'budget_over': {
      const spent = n.amount ?? 0;
      const limit = n.previousAmount ?? 0;
      // "in November", with the year only when it is not this one.
      const month = n.dueOn
        ? ` in ${n.dueOn.slice(0, 4) === today.slice(0, 4) ? fromIsoDate(n.dueOn).toLocaleDateString('en-GB', { month: 'long' }) : formatMonth(n.dueOn.slice(0, 7))}`
        : '';
      return {
        lead: name,
        rest:
          n.type === 'budget_over'
            ? ' is over budget'
            : ` is at ${String(limit > 0 ? Math.round((spent / limit) * 100) : 0)}% of its budget`,
        detail: `${money(spent)} of ${money(limit)}${month}`,
      };
    }
    case 'tx_added':
      return {
        lead: actor,
        rest: ` ${n.action === 'restore' ? 'restored' : 'added'} ${name}`,
        detail: n.amount ? `Your share ${money(n.amount)}` : 'You are the payer',
      };
    case 'tx_changed':
      return {
        lead: actor,
        rest: ` changed ${name}`,
        detail: `Your share ${money(n.previousAmount)} to ${money(n.amount)}`,
      };
    case 'tx_deleted':
      return {
        lead: actor,
        rest: ` deleted ${name}`,
        detail: n.amount ? `Your share was ${money(n.amount)}` : 'You were the payer',
      };
    case 'import_added': {
      const what = plural(n.count ?? 0, 'shared transaction', 'shared transactions');
      return {
        lead: actor,
        rest: n.action === 'undo' ? ` undid an import of ${what}` : ` imported ${what}`,
        detail: `Your share ${money(n.amount)}`,
      };
    }
    case 'settlement_recorded': {
      const from = n.parties?.from;
      const to = n.parties?.to;
      const who = (person: typeof from) =>
        !person ? 'someone' : person.userId === viewerId ? 'you' : person.displayName;
      const payment = `${who(from)} to ${who(to)}`;
      return {
        lead: actor,
        rest: n.action === 'delete' ? ' deleted a payment' : ' recorded a payment',
        detail: `${payment.charAt(0).toUpperCase()}${payment.slice(1)}, ${money(n.amount)}`,
      };
    }
  }
}

/** Where opening it goes (within its household). */
export function notificationTarget(n: Notification):
  | { to: '/h/$householdId/recurring/$seriesId'; params: { householdId: string; seriesId: string } }
  | {
      to: '/h/$householdId/transactions/$transactionId';
      params: { householdId: string; transactionId: string };
    }
  | { to: '/h/$householdId/budgets'; params: { householdId: string }; search: { month?: string } }
  | { to: '/h/$householdId/transactions'; params: { householdId: string } }
  | { to: '/h/$householdId'; params: { householdId: string } } {
  const householdId = n.householdId;
  switch (n.type) {
    case 'renewal_due':
    case 'renewal_missed':
    case 'price_changed':
      return {
        to: '/h/$householdId/recurring/$seriesId',
        params: { householdId, seriesId: n.subjectId },
      };
    case 'budget_near':
    case 'budget_over':
      return {
        to: '/h/$householdId/budgets',
        params: { householdId },
        search: n.dueOn ? { month: n.dueOn.slice(0, 7) } : {},
      };
    case 'tx_added':
    case 'tx_changed':
      return {
        to: '/h/$householdId/transactions/$transactionId',
        params: { householdId, transactionId: n.subjectId },
      };
    case 'tx_deleted':
    case 'import_added':
      return { to: '/h/$householdId/transactions', params: { householdId } };
    case 'settlement_recorded':
      return { to: '/h/$householdId', params: { householdId } };
  }
}

/** "now", "5m", "2h", "3d", then a date. */
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${String(days)}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
