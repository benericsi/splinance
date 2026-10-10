import { expect, test } from '@playwright/test';
import { createHousehold, logout, newUser, register, submitLogin } from '../support/app';

test('a reload keeps the session through the refresh cookie', async ({ page }) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');

  // A full page load: the in-memory access token is gone, the refresh cookie restores it.
  await page.goto(`/h/${householdId}/settings`);
  await expect(page.getByRole('heading', { name: 'Household settings' })).toBeVisible();
  await expect(page).toHaveURL(`/h/${householdId}/settings`);
});

test('a logged-out deep link returns to the page after login', async ({ page, browser }) => {
  const user = newUser('Anna');
  await register(page, user);
  const { householdId } = await createHousehold(page, 'Home');

  // A fresh browser has no refresh cookie.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto(`/h/${householdId}/settings`);
  await expect(fresh).toHaveURL(/\/login\?redirect=/);

  await submitLogin(fresh, { email: user.email, password: 'wrong-password-123' });
  await expect(fresh.getByText('Invalid email or password')).toBeVisible();

  await submitLogin(fresh, user);
  await expect(fresh).toHaveURL(`/h/${householdId}/settings`);
  await context.close();
});

test('after logout the next user lands on their own household', async ({ page }) => {
  const ben = newUser('Ben');
  await register(page, ben);
  const { householdId: bensHousehold } = await createHousehold(page, 'Bens place');
  await logout(page);

  await register(page, newUser('Anna'));
  const { householdId: annasHousehold } = await createHousehold(page, 'Annas place');
  await logout(page);

  await submitLogin(page, ben);
  await expect(page).toHaveURL(`/h/${bensHousehold}`);

  // Anna's household does not exist for Ben.
  await page.goto(`/h/${annasHousehold}`);
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
