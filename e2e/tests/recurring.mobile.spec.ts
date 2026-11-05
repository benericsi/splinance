import { expect, test } from '@playwright/test';
import { createHousehold, field, newUser, register } from '../support/app';

const pad = (n: number) => String(n).padStart(2, '0');

function inTwoDays(): string {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test('recurring payments and the bell work on a phone', async ({ page }) => {
  await register(page, newUser('Anna'));
  await createHousehold(page, 'Home');

  // Six sections fit the tab bar ("Transactions" shows as "Activity").
  const tabs = page.getByRole('navigation', { name: 'Household sections' });
  await expect(tabs.getByRole('link', { name: 'Activity' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Recurring' }).click();
  await expect(page.getByRole('heading', { name: 'Recurring', level: 1 })).toBeVisible();

  // The add dialog is a drawer.
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Add recurring payment' });
  await field(drawer, 'Name').fill('Netflix');
  await field(drawer, 'Amount').fill('4990');
  await field(drawer, 'Next or last payment').fill(inTwoDays());
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Recurring payment added')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Netflix/ })).toContainText('due in 2 days');

  // The bell opens as a drawer too, with the renewal in it.
  await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
  const bell = page.getByRole('dialog', { name: 'Notifications' });
  await expect(bell.getByRole('button', { name: /Netflix renews/ })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
