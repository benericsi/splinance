import type { Notification, Transaction } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { budgetNote } from '@/features/budgets/status';
import { reasonText } from '@/features/imports/review';
import { describeNotification, timeAgo } from '@/features/notifications/describe';
import { dueLabel } from '@/features/recurring/view';
import { compactNumber, formatMonthRange, shortMonth } from '@/features/reports/format';
import { formatDayHeading, formatMonth } from '@/features/transactions/dates';
import { describeTransaction } from '@/features/transactions/describe';
import { amountProblemMessage } from '@/features/transactions/money';
import { ApiError } from '@/lib/http';
import { localeStore } from '@/lib/locale';
import { errorMessage } from '@/lib/query-client';
import { testUser } from '../../test/utils';

// The setup switches back to English after each test.
const hungarian = () => localeStore.setLocale('hu', { persist: false });
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('money pages in Hungarian', () => {
  it('writes months and days the Hungarian way', async () => {
    await hungarian();
    const now = new Date(2026, 9, 10);
    expect(formatMonth('2026-10')).toBe('2026. október');
    expect(formatDayHeading('2026-10-10', now)).toBe('Ma, okt. 10., szombat');
    expect(formatDayHeading('2026-10-09', now)).toBe('Tegnap, okt. 9., péntek');
    expect(formatDayHeading('2025-12-31', now)).toBe('2025. dec. 31., szerda');
  });

  it('keeps chart labels in the UI language', async () => {
    expect(formatMonthRange('2026-05', '2026-10')).toBe('May – Oct 2026');
    await hungarian();
    expect(shortMonth('2026-09')).toBe('szept.');
    expect(formatMonthRange('2026-05', '2026-10')).toBe('2026. máj.–okt.');
    expect(plain(compactNumber(120_000))).toBe('120 E');
  });

  it('describes rows, budgets, reasons and due dates', async () => {
    await hungarian();
    const transaction = {
      kind: 'expense',
      paidBy: { userId: 'ben', displayName: 'Ben' },
      split: {
        method: 'equal',
        shares: [
          { userId: testUser.id, displayName: 'Anna', amount: 500, basisPoints: null },
          { userId: 'ben', displayName: 'Ben', amount: 500, basisPoints: null },
        ],
      },
    } as unknown as Transaction;
    expect(describeTransaction(transaction, testUser.id)).toBe('Ben fizette · egyenlően');
    expect(plain(budgetNote({ amount: 10_000, spent: 12_000 }, 'HUF'))).toBe('Túllépve: 2000 Ft');
    expect(reasonText({ code: 'imported' })).toBe('Már importálva');
    expect(dueLabel({ nextOn: '2026-11-08', daysUntil: 3 })).toBe('3 nap múlva');
    expect(amountProblemMessage('empty', 'HUF')).toBe('Add meg az összeget');
  });

  it('says notifications with the name first', async () => {
    await hungarian();
    const n = {
      type: 'tx_added',
      action: 'create',
      actor: { userId: 'ben', displayName: 'Ben' },
      subjectName: 'Pizza',
      amount: 2000,
      currency: 'HUF',
    } as Notification;
    const { lead, rest, detail } = describeNotification(n, testUser.id, '2026-11-05');
    expect(plain(`${lead}${rest} | ${detail}`)).toBe('Ben hozzáadta: Pizza | A részed: 2000 Ft');
    expect(timeAgo('2026-11-05T11:15:00Z', new Date('2026-11-05T12:00:00Z'))).toBe('45 p');

    // Hungarian dates end in a period: a sentence after one must not add another.
    const missed = {
      type: 'renewal_missed',
      subjectName: 'Netflix',
      dueOn: '2026-08-03',
      currency: 'HUF',
    } as Notification;
    expect(describeNotification(missed, testUser.id, '2026-11-05').detail).toBe(
      'Várható volt: aug. 3. Lemondtad?',
    );
  });

  it('names the row an import stopped at', async () => {
    const error = new ApiError(400, 'INVALID_MEMBER', 'Row 2: ...', { row: 2 });
    expect(errorMessage(error)).toMatch(/^Row 2: /);
    await hungarian();
    expect(errorMessage(error)).toMatch(/^2\. sor: /);
  });
});
