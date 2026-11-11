import { expect, test } from '@playwright/test';
import {
  createHousehold,
  fillTransaction,
  money,
  monthStat,
  newUser,
  register,
} from '../support/app';

test('the calendar is a view of the Activity tab on a phone', async ({ page }) => {
  await register(page, newUser('Anna'));
  await createHousehold(page, 'Home');

  const tabs = page.getByRole('navigation', { name: 'Household sections' });
  await tabs.getByRole('link', { name: 'Activity' }).click();
  await page.getByRole('link', { name: 'Add transaction' }).last().click();
  await fillTransaction(page, { amount: '1500', description: 'Bakery' });

  // No tab of its own: the switch above the month moves between list and calendar.
  await expect(tabs.getByRole('link', { name: 'Calendar' })).toHaveCount(0);
  const views = page.getByRole('navigation', { name: 'View' });
  await views.getByRole('link', { name: 'Calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Activity' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(monthStat(page, 'Spent')).toContainText(money('1500 Ft'));

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // A day opens as a drawer; the back button closes it.
  const today = page.getByRole('list', { name: /^Days of / }).locator('a[aria-current="date"]');
  await today.click();
  const day = page.getByRole('dialog', { name: /^Today/ });
  await expect(day.getByRole('link').filter({ hasText: 'Bakery' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();

  await views.getByRole('link', { name: 'List' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
});
