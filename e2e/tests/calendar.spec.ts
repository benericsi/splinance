import { expect, test } from '@playwright/test';
import {
  addTransaction,
  householdWithPartner,
  money,
  monthStat,
  openTransactions,
  pickCategory,
  transactionRow,
} from '../support/app';

test('the calendar shows the month by day, and opens a day', async ({ page, browser }) => {
  const { householdId, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await addTransaction(page, {
    amount: '12000',
    description: 'Weekly shop',
    category: 'Groceries',
  });
  await addTransaction(page, { amount: '2000', description: 'Snacks for me', private: true });

  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Calendar', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(monthStat(page, 'Spent')).toContainText(money('14 000 Ft'));

  // Both purchases were made today.
  const grid = page.getByRole('list', { name: /^Days of / });
  const today = grid.locator('a[aria-current="date"]');
  await expect(today).toHaveAccessibleName(money('today, spent 14 000 Ft'));

  // One category: only the shop, on one day, with nothing to compare it with yet.
  await pickCategory(page, 'Category', 'Groceries');
  await expect(monthStat(page, 'Spent')).toContainText(money('12 000 Ft'));
  await expect(monthStat(page, 'Days with spending')).toHaveText('1 day');
  await expect(today).toHaveAccessibleName(money('today, spent 12 000 Ft'));
  await expect(page).toHaveURL(/\/calendar\?category=[0-9a-f-]{36}$/);
  await pickCategory(page, 'Category', 'All categories');
  await expect(monthStat(page, 'Spent')).toContainText(money('14 000 Ft'));

  // Her share: half of the shared shop, all of the private snack.
  await page
    .getByRole('group', { name: 'Whose spending' })
    .getByRole('button', { name: 'Your share' })
    .click();
  await expect(today).toHaveAccessibleName(money('today, spent 8000 Ft'));
  await expect(monthStat(page, 'You spent')).toContainText(money('8000 Ft'));

  // The day opens over the month; its rows open the transaction, and back returns.
  await today.click();
  const day = page.getByRole('dialog', { name: /^Today/ });
  await expect(day).toContainText(money('Spent 8000 Ft'));
  await expect(day.getByRole('link')).toHaveCount(2);
  await transactionRow(page, 'Weekly shop').click();
  await expect(page.getByRole('dialog', { name: 'Edit transaction' })).toBeVisible();
  await page.goBack();
  await expect(day).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/\/calendar\?view=mine$/);

  // Last month: nothing happened there.
  await page.getByRole('link', { name: 'Previous month' }).click();
  await expect(monthStat(page, 'You spent')).toContainText(money('0 Ft'));
  await expect(grid.locator('a[aria-current="date"]')).toHaveCount(0);

  await partnerContext.close();
});
