import { expect, test } from '@playwright/test';
import { newUser } from '../support/app';

// A visitor whose browser asks for Hungarian. The other suites run in English (en-US).
test.use({ locale: 'hu-HU' });

test('a Hungarian browser gets the app in Hungarian, and a saved language follows the account', async ({
  page,
  browser,
}) => {
  const user = newUser('Anna');

  // First visit: the browser's language picks Hungarian, before anyone signed in.
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect(page.getByRole('heading', { name: 'Bejelentkezés' })).toBeVisible();

  await page.getByRole('link', { name: 'Hozz létre egyet' }).click();
  await page.getByLabel(/^Megjelenített név\*?$/).fill(user.displayName);
  await page.getByLabel(/^E-mail\*?$/).fill(user.email);
  await page.getByLabel(/^Jelszó\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'Fiók létrehozása' }).click();
  await expect(page).toHaveURL('/welcome');

  // A household made in Hungarian starts with Hungarian categories.
  await page.getByRole('link', { name: /Háztartás létrehozása/ }).click();
  await page.getByRole('textbox').first().fill('Otthon');
  await page.getByRole('button', { name: /létrehozása/ }).click();
  await page.getByRole('link', { name: 'Most kihagyom' }).click();
  await page.getByRole('link', { name: 'Tovább ide: Otthon' }).click();
  await expect(page.getByRole('heading', { name: 'Egyenleg' })).toBeAttached();
  const householdId = new URL(page.url()).pathname.split('/')[2] ?? '';

  await page.goto(`/h/${householdId}/settings`);
  await expect(page.getByRole('link', { name: 'Élelmiszer' })).toBeVisible();

  // Switching in the account menu saves the choice to the account.
  await page.getByRole('button', { name: 'Fiókmenü' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Household settings' })).toBeVisible();
  // Names are data: the categories keep the language they were made in.
  await expect(page.getByRole('link', { name: 'Élelmiszer' })).toBeVisible();

  // Another browser, also Hungarian: the saved English wins once signed in.
  const other = await browser.newContext({ locale: 'hu-HU' });
  const second = await other.newPage();
  await second.goto('/login');
  await expect(second.getByRole('heading', { name: 'Bejelentkezés' })).toBeVisible();
  await second.getByLabel(/^E-mail\*?$/).fill(user.email);
  await second.getByLabel(/^Jelszó\*?$/).fill(user.password);
  await second.getByRole('button', { name: 'Bejelentkezés' }).click();
  await expect(second.locator('html')).toHaveAttribute('lang', 'en');
  await expect(second.getByRole('heading', { name: 'Balance' })).toBeAttached();
  await other.close();
});
