import { expect, type Page, test } from '@playwright/test';
import { createHousehold, field, logout, newUser, register, submitLogin } from '../support/app';
import { FAKE_OIDC_ISSUER } from '../support/env';

/** At the fake provider (127.0.0.1, another site): "Sign in as" stands in for Google. */
async function approveAtGoogle(page: Page, person: { email: string; name?: string }) {
  await expect(page).toHaveURL(new RegExp(`^${FAKE_OIDC_ISSUER}/authorize`));
  await page.getByLabel('Email', { exact: true }).fill(person.email);
  if (person.name) await page.getByLabel('Name', { exact: true }).fill(person.name);
  await page.getByRole('button', { name: 'Approve' }).click();
}

async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await expect(page.getByRole('heading', { name: 'Sign-in methods' })).toBeVisible();
}

function methods(page: Page) {
  return page.locator('[data-slot="card"]', {
    has: page.getByRole('heading', { name: 'Sign-in methods' }),
  });
}

test('a password account connects Google, signs in with it, and disconnects it', async ({
  page,
}) => {
  const anna = newUser('Anna');
  await register(page, anna);
  const { householdId } = await createHousehold(page, 'Home');

  await openAccount(page);
  await methods(page).getByRole('button', { name: 'Connect' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Connect Google?' });
  await confirm.getByLabel('Current password').fill(anna.password);
  await confirm.getByRole('button', { name: 'Continue to Google' }).click();
  await approveAtGoogle(page, { email: anna.email });

  // Back on the account page, with the session that started it.
  await expect(page).toHaveURL('/account');
  await expect(
    page.getByText('Google is now connected. Next time, you can continue with Google.'),
  ).toBeVisible();
  await expect(methods(page)).toContainText(/Connected .* · Last used today/);

  await logout(page);
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await approveAtGoogle(page, { email: anna.email });
  await expect(page).toHaveURL(`/h/${householdId}`);

  await openAccount(page);
  await methods(page).getByRole('button', { name: 'Disconnect' }).click();
  const disconnect = page.getByRole('alertdialog', { name: 'Disconnect Google?' });
  await disconnect.getByLabel('Current password').fill(anna.password);
  await disconnect.getByRole('button', { name: 'Disconnect' }).click();
  await expect(
    page.getByText('Google is disconnected. Other devices are signed out.'),
  ).toBeVisible();
  await expect(methods(page)).toContainText('Not connected');

  // Google alone no longer gets in: the same email asks for the password again.
  await logout(page);
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await approveAtGoogle(page, { email: anna.email });
  await expect(page).toHaveURL('/login?oauth=link');
});

test('a Google-only account cannot disconnect, but sets a password and logs in with it', async ({
  page,
}) => {
  const { email } = newUser('Gabi');
  await page.goto('/login');
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await approveAtGoogle(page, { email, name: 'Gabi' });
  await expect(page).toHaveURL('/welcome');

  await openAccount(page);
  await expect(methods(page).getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  await expect(methods(page)).toContainText('Your only way to sign in.');

  // Signed in a moment ago, so no Google confirmation is needed.
  await methods(page).getByRole('link', { name: 'Set a password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set a password' });
  const password = 'quiet-harbor-lantern-42';
  await field(dialog, 'New password').fill(password);
  await dialog.getByRole('button', { name: 'Set password' }).click();
  await expect(
    page.getByText('Password set. You can now also log in with your email.'),
  ).toBeVisible();
  await expect(methods(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();

  await logout(page);
  await submitLogin(page, { email, password });
  await expect(page).toHaveURL('/welcome');
});
