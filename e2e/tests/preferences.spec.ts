import { expect, test } from '@playwright/test';
import { createHousehold, newUser, openTransactions, register } from '../support/app';

test('preferences saved to the account set how the overview, new transactions and reports open', async ({
  page,
}) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await expect(page).toHaveURL('/account/preferences');

  const pick = async (setting: string, option: string) => {
    const group = page.getByRole('group', { name: setting });
    await group.getByRole('button', { name: option }).click();
    await expect(group.getByRole('button', { name: option })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  };
  await pick('Overview opens as', 'Map');
  await pick('New transactions start as', 'Just me');
  // Each pick is saved as it is made; wait for the last one before reloading.
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/account/preferences') && response.ok(),
  );
  await pick('Reports and calendar show', 'Your share');
  await saved;

  // Saved to the account: a reload (a fresh session restore) brings them back.
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Overview opens as' }).getByRole('button', { name: 'Map' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // The overview opens as a map without `?view=map`; the cards are a click away.
  await page.goto(`/h/${householdId}`);
  await expect(page.getByRole('region', { name: 'Household map' })).toBeVisible();
  await page
    .getByRole('group', { name: 'Overview layout' })
    .getByRole('button', { name: 'Cards' })
    .click();
  await expect(page).toHaveURL(`/h/${householdId}?view=cards`);
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeVisible();

  // A new transaction starts as just for Anna.
  await openTransactions(page, householdId);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(dialog.getByRole('button', { name: 'Just me' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Reports open on her share.
  await page.goto(`/h/${householdId}/reports`);
  await expect(
    page.getByRole('group', { name: 'Whose spending' }).getByRole('button', { name: 'Your share' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('hiding amounts blurs them on this device, also after a reload', async ({ page }) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');
  // The month totals are there even before the first transaction.
  await openTransactions(page, householdId);

  const eye = page.getByRole('button', { name: 'Hide amounts' });
  await eye.click();
  await expect(eye).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveClass(/hide-amounts/);
  // The blur is CSS on every marked amount; the numbers stay for screen readers.
  const amount = page.locator('[data-amount]').first();
  await expect(amount).toHaveCSS('filter', /blur/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/hide-amounts/);
  await expect(page.getByRole('button', { name: 'Hide amounts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The same setting in Preferences.
  await page.goto('/account/preferences');
  const amounts = page.getByRole('group', { name: 'Amounts' });
  await expect(amounts.getByRole('button', { name: 'Hide' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await amounts.getByRole('button', { name: 'Show' }).click();
  await expect(page.locator('html')).not.toHaveClass(/hide-amounts/);
});
