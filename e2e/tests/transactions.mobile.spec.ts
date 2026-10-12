import { expect, test } from '@playwright/test';
import {
  createHousehold,
  fillTransaction,
  money,
  monthStat,
  newUser,
  register,
  transactionRow,
} from '../support/app';

test('transactions are added from a drawer on a phone', async ({ page }) => {
  await register(page, newUser('Anna'));
  await createHousehold(page, 'Home');

  await page
    .getByRole('navigation', { name: 'Household sections' })
    .getByRole('link', { name: 'Transactions' })
    .click();
  await expect(page.getByRole('heading', { name: 'Add your first transaction' })).toBeVisible();

  // The empty state has its own button; the floating one is always there.
  const fab = page.getByRole('link', { name: 'Add transaction' }).last();
  await fab.click();
  await expect(page).toHaveURL(/\/transactions\/new$/);
  await fillTransaction(page, { amount: '1500', description: 'Bakery' });
  await expect(transactionRow(page, 'Bakery')).toContainText('You paid · for you');

  await fab.click();
  await fillTransaction(page, { amount: '12500', description: 'Groceries' });
  await expect(transactionRow(page, 'Groceries')).toBeVisible();
  await expect(monthStat(page, 'Spent')).toContainText(money('14 000 Ft'));

  // Rows open the edit drawer; the back button closes it.
  await transactionRow(page, 'Bakery').click();
  await expect(page.getByRole('dialog', { name: 'Edit transaction' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
