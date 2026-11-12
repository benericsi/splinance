import { expect, type Page, test } from '@playwright/test';
import {
  addTransaction,
  field,
  householdWithPartner,
  money,
  openTransactions,
} from '../support/app';
import { chooseExport, khExport, khPurchase } from '../support/bank';

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of a day relative to today (local time, like the app). */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The 1st of this month and of the months before it, oldest first (never after today). */
function firstOfMonths(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (count - 1 - index));
    return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-01`;
  });
}

async function openRecurring(page: Page, householdId: string) {
  await page.goto(`/h/${householdId}/recurring`);
  await expect(page.getByRole('heading', { name: 'Recurring', level: 1 })).toBeVisible();
}

test('a recurring payment added by hand recognizes the bank charges imported later', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);
  const charges = firstOfMonths(3);

  // Anna adds her Spotify by hand, for herself; nothing in the app matches it yet.
  await openRecurring(page, householdId);
  await expect(page.getByRole('heading', { name: 'Track subscriptions and bills' })).toBeVisible();
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add recurring payment' });
  await field(dialog, 'Name').fill('Spotify xyz');
  // The text to match follows the name, without the plan words.
  await expect(field(dialog, 'Matches bank text containing')).toHaveValue('spotify');
  await field(dialog, 'Amount').fill('3290');
  await field(dialog, 'Next or last payment').fill(charges[0] ?? day(0));
  await dialog.getByRole('button', { name: 'Only me' }).click();
  await expect(dialog.getByText(/No past payments match yet/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Recurring payment added')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Spotify xyz/ })).toBeVisible();

  // Three months of the bank's Spotify charges: the review already says what they are.
  await page.goto(`/h/${householdId}/transactions/import`);
  await chooseExport(
    page,
    khExport(
      charges.map((date, index) =>
        khPurchase({
          booked: date.replaceAll('-', '.'),
          paid: date.replaceAll('-', '/'),
          id: `SPOTIFY-E2E-${String(index)}`,
          partner: 'SPOTIFY P46ED88101',
          amount: 3290,
        }),
      ),
    ),
  );
  const ready = page.getByRole('region', { name: 'Ready to import' });
  await expect(ready.getByText('Recurring: Spotify xyz')).toHaveCount(3);
  await page.getByRole('button', { name: 'Import 3 transactions' }).click();
  await expect(page.getByText('3 transactions imported')).toBeVisible();

  // The series owns them now.
  await openRecurring(page, householdId);
  await page.getByRole('link', { name: /^Spotify xyz/ }).click();
  const series = page.getByRole('dialog', { name: 'Spotify xyz' });
  await expect(series.getByRole('heading', { name: 'Payments found (3)' })).toBeVisible();
  await expect(series.getByText('Imported')).toHaveCount(3);

  // Ben sees neither Anna's private series nor a suggestion from her private payments.
  await openRecurring(partner, householdId);
  await expect(
    partner.getByRole('heading', { name: 'Track subscriptions and bills' }),
  ).toBeVisible();

  await partnerContext.close();
});

test('the bell tells about what the other person did and about renewals', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // Ben adds a shared expense; Anna's badge shows it once her page asks again.
  await openTransactions(partner, householdId);
  await addTransaction(partner, { amount: '9000', description: 'Groceries' });
  await page.reload();
  const bell = page.getByRole('button', { name: 'Notifications, 1 unread' });
  await expect(bell).toBeVisible();
  await bell.click();
  const item = page.getByRole('button', { name: /Ben added Groceries/ });
  await expect(item).toContainText(money('Your share 4500 Ft'));

  // Opening it goes to the transaction and marks it read.
  await item.click();
  const edit = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(edit).toBeVisible();
  // The page behind a modal is hidden from assistive tech: check the badge once it closes.
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // A renewal two days away reminds both of them.
  await openRecurring(page, householdId);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add recurring payment' });
  await field(dialog, 'Name').fill('Netflix');
  await field(dialog, 'Amount').fill('4990');
  await field(dialog, 'Next or last payment').fill(day(2));
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Recurring payment added')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();

  await partner.reload();
  await partner.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  await expect(partner.getByRole('button', { name: /Netflix renews/ })).toBeVisible();
  await partner.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(partner.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  await partnerContext.close();
});

test('a salary tracked as recurring income sits apart from the payments', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // Anna adds her salary: the dialog turns to income words, and it is hers alone.
  await openRecurring(page, householdId);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add recurring payment' })
    .getByRole('button', { name: 'Income' })
    .click();
  const income = page.getByRole('dialog', { name: 'Add recurring income' });
  await field(income, 'Name').fill('Salary');
  await field(income, 'Amount').fill('690000');
  await field(income, 'Next or last time it arrived').fill(day(5));
  await income.getByRole('button', { name: 'Only me' }).click();
  await expect(income.getByText(/Nothing received matches yet/)).toBeVisible();
  await income.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Recurring income added')).toBeVisible();

  // And a shared payment next to it.
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  const payment = page.getByRole('dialog', { name: 'Add recurring payment' });
  await field(payment, 'Name').fill('Netflix');
  await field(payment, 'Amount').fill('4990');
  await field(payment, 'Next or last payment').fill(day(20));
  await payment.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Recurring payment added')).toBeVisible();

  // Income first, expected rather than due, with a plus; the totals stand apart.
  const salary = page
    .getByRole('region', { name: 'Income' })
    .getByRole('link', { name: /^Salary/ });
  await expect(salary).toContainText('expected in 5 days');
  await expect(salary).toContainText(money('690 000 Ft'));
  await expect(
    page.getByRole('region', { name: 'Payments' }).getByRole('link', { name: /^Netflix/ }),
  ).toBeVisible();
  await expect(page.getByText('Coming in')).toBeVisible();
  await expect(page.getByText('Going out')).toBeVisible();

  // Money about to arrive is no reminder: the bell stays quiet about it.
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // The calendar expects it on its day; what is "still to come" counts payments only.
  await page.goto(`/h/${householdId}/calendar/${day(5)}`);
  const dayDialog = page.getByRole('dialog');
  await expect(dayDialog.getByRole('link', { name: /Salary/ })).toContainText('Expected income');

  // Ben sees the shared payment and nothing of Anna's salary.
  await openRecurring(partner, householdId);
  await expect(partner.getByRole('link', { name: /^Netflix/ })).toBeVisible();
  await expect(partner.getByRole('region', { name: 'Income' })).toHaveCount(0);
  await expect(partner.getByText('Salary')).toHaveCount(0);

  await partnerContext.close();
});
