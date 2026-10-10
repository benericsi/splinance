import { expect, test } from '@playwright/test';
import { createHousehold, logout, newUser, register } from '../support/app';

test('the household shell works on a phone', async ({ page }) => {
  await register(page, newUser('Anna'));
  await createHousehold(page, 'Home');

  // Sections move to a bottom tab bar on phones.
  const tabs = page.getByRole('navigation', { name: 'Household sections' });
  await expect(tabs).toBeVisible();
  await tabs.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Household settings' })).toBeVisible();

  // URL-driven modals render as a drawer on phones; the back button closes them.
  await page.getByRole('link', { name: 'Invite' }).click();
  await expect(page.getByRole('dialog', { name: 'Invite to Home' })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/invite$/);
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Nothing overflows sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await logout(page);
});
