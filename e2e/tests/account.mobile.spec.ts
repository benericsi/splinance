import { expect, test } from '@playwright/test';
import { field, newUser, register } from '../support/app';

test('account settings fit a phone, the password dialog is a drawer', async ({ page }) => {
  const anna = newUser('Anna');
  // Onboarding has the account menu too: no household needed.
  await register(page, anna);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await expect(page.getByRole('heading', { name: 'Sign-in methods' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await page.getByRole('link', { name: 'Change' }).click();
  const drawer = page.getByRole('dialog', { name: 'Change password' });
  await expect(drawer).toBeVisible();
  await expect(field(drawer, 'Current password')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Back leads out of the account pages.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL('/welcome');
});
