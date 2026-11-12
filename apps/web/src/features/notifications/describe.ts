import { daysBetween, type Notification } from '@splinance/shared';
import { formatDateWith, formatMonth, fromIsoDate } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { i18n } from '@/i18n';

/** A notification in words: a bold lead (a name), the rest of the sentence, a detail line. */
export interface Described {
  lead: string;
  rest: string;
  detail: string;
}

const shortDay = (value: string) =>
  formatDateWith(fromIsoDate(value), { day: 'numeric', month: 'short' });

/** " renews today", " renews tomorrow", " renews on Thursday", " renews on 12 Nov". */
function renews(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days <= 0) return i18n.t('notifications:renewal.today');
  if (days === 1) return i18n.t('notifications:renewal.tomorrow');
  const day = days < 7 ? formatDateWith(fromIsoDate(dueOn), { weekday: 'long' }) : shortDay(dueOn);
  return i18n.t('notifications:renewal.on', { day });
}

/**
 * The sentence for a notification as `viewerId` reads it on `today`. Names come from the
 * API (current data); amounts are the reader's (their share, or the household's budget).
 */
export function describeNotification(n: Notification, viewerId: string, today: string): Described {
  const money = (minor: number | null) => formatMoney(minor ?? 0, n.currency);
  const name = n.subjectName ?? i18n.t('notifications:aPayment');
  const actor = n.actor?.displayName ?? i18n.t('notifications:someone');
  // A recurring income reads the other way round: it arrives (or does not), it is not paid.
  const income = n.subjectKind === 'income';

  switch (n.type) {
    case 'renewal_due':
      return {
        lead: name,
        rest: n.dueOn ? renews(n.dueOn, today) : i18n.t('notifications:renewal.soon'),
        detail: n.resolvedAt ? i18n.t('notifications:renewal.paid') : money(n.amount),
      };
    case 'renewal_missed':
      return {
        lead: name,
        rest: i18n.t(income ? 'notifications:income.missed' : 'notifications:renewal.missed'),
        detail: n.dueOn
          ? i18n.t(income ? 'notifications:income.expected' : 'notifications:renewal.expected', {
              date: shortDay(n.dueOn),
            })
          : i18n.t(income ? 'notifications:income.stopped' : 'notifications:renewal.cancelled'),
      };
    case 'price_changed': {
      const previous = n.previousAmount ?? 0;
      const amount = n.amount ?? 0;
      const percent = previous > 0 ? Math.round((Math.abs(amount - previous) / previous) * 100) : 0;
      return {
        lead: name,
        rest:
          amount > previous
            ? i18n.t(income ? 'notifications:income.up' : 'notifications:price.up', { percent })
            : i18n.t(income ? 'notifications:income.down' : 'notifications:price.down', {
                percent,
              }),
        detail: i18n.t('notifications:price.change', { from: money(previous), to: money(amount) }),
      };
    }
    case 'budget_near':
    case 'budget_over': {
      const spent = n.amount ?? 0;
      const limit = n.previousAmount ?? 0;
      const amounts = { spent: money(spent), limit: money(limit) };
      // "November", with the year only when it is not this one.
      const month = n.dueOn
        ? n.dueOn.slice(0, 4) === today.slice(0, 4)
          ? formatDateWith(fromIsoDate(n.dueOn), { month: 'long' })
          : formatMonth(n.dueOn.slice(0, 7))
        : undefined;
      return {
        lead: name,
        rest:
          n.type === 'budget_over'
            ? i18n.t('notifications:budget.over')
            : i18n.t('notifications:budget.near', {
                percent: limit > 0 ? Math.round((spent / limit) * 100) : 0,
              }),
        detail: month
          ? i18n.t('notifications:budget.detailIn', { ...amounts, month })
          : i18n.t('notifications:budget.detail', amounts),
      };
    }
    case 'tx_added':
      return {
        lead: actor,
        rest:
          n.action === 'restore'
            ? i18n.t('notifications:tx.restored', { name })
            : i18n.t('notifications:tx.added', { name }),
        detail: n.amount
          ? i18n.t('notifications:tx.share', { amount: money(n.amount) })
          : i18n.t('notifications:tx.payer'),
      };
    case 'tx_changed':
      return {
        lead: actor,
        rest: i18n.t('notifications:tx.changed', { name }),
        detail: i18n.t('notifications:tx.shareChange', {
          from: money(n.previousAmount),
          to: money(n.amount),
        }),
      };
    case 'tx_deleted':
      return {
        lead: actor,
        rest: i18n.t('notifications:tx.deleted', { name }),
        detail: n.amount
          ? i18n.t('notifications:tx.shareWas', { amount: money(n.amount) })
          : i18n.t('notifications:tx.wasPayer'),
      };
    case 'import_added': {
      const count = n.count ?? 0;
      return {
        lead: actor,
        rest:
          n.action === 'undo'
            ? i18n.t('notifications:import.undone', { count })
            : i18n.t('notifications:import.added', { count }),
        detail: i18n.t('notifications:tx.share', { amount: money(n.amount) }),
      };
    }
    case 'settlement_recorded': {
      const from = n.parties?.from;
      const to = n.parties?.to;
      const who = (person: typeof from) =>
        !person
          ? i18n.t('notifications:someoneLower')
          : person.userId === viewerId
            ? i18n.t('notifications:you')
            : person.displayName;
      const payment = i18n.t('notifications:settlement.detail', {
        from: who(from),
        to: who(to),
        amount: money(n.amount),
      });
      return {
        lead: actor,
        rest:
          n.action === 'delete'
            ? i18n.t('notifications:settlement.deleted')
            : i18n.t('notifications:settlement.recorded'),
        detail: `${payment.charAt(0).toUpperCase()}${payment.slice(1)}`,
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
  if (minutes < 1) return i18n.t('notifications:ago.now');
  if (minutes < 60) return i18n.t('notifications:ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('notifications:ago.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('notifications:ago.days', { count: days });
  return formatDateWith(new Date(iso), { day: 'numeric', month: 'short' });
}
