import { expect, type Page, test } from '@playwright/test';
import {
  createHousehold,
  field,
  householdWithPartner,
  logout,
  newUser,
  openSettings,
  register,
  submitLogin,
} from '../support/app';

async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await expect(page).toHaveURL('/account');
  // The heading is also on the loading skeleton; the methods card comes with the data.
  await expect(page.getByRole('heading', { name: 'Sign-in methods' })).toBeVisible();
}

test('changing the password signs out the other devices, not this one', async ({
  page,
  browser,
}) => {
  const anna = newUser('Anna');
  await register(page, anna);
  await createHousehold(page, 'Home');

  // A second device, signed in too.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto('/login');
  await submitLogin(other, anna);
  await expect(other).toHaveURL(/\/h\//);

  await openAccount(page);
  await page.getByRole('link', { name: 'Change' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change password' });
  await field(dialog, 'Current password').fill(anna.password);
  const newPassword = `${anna.password}-renewed`;
  await field(dialog, 'New password').fill(newPassword);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed. Other devices are signed out.')).toBeVisible();
  await expect(page).toHaveURL('/account');

  // This device stays signed in across a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign-in methods' })).toBeVisible();

  // The other one is out on its next page load.
  await other.reload();
  await expect(other).toHaveURL(/\/login/);
  await otherContext.close();

  await logout(page);
  await submitLogin(page, anna);
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await submitLogin(page, { email: anna.email, password: newPassword });
  await expect(page).toHaveURL(/\/h\//);
});

test('a new display name shows for the partner', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openAccount(page);
  await page.getByRole('button', { name: 'Edit name' }).click();
  await field(page, 'Display name').fill('Anna K.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Name changed')).toBeVisible();

  // The account menu follows at once.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menu')).toContainText('Anna K.');
  await page.keyboard.press('Escape');

  await openSettings(partner, householdId);
  await expect(partner.getByText('Anna K.', { exact: true })).toBeVisible();
  await partnerContext.close();
});
