import { expect, type Page, test } from '@playwright/test';
import {
  budgetRow,
  monthOf,
  monthStat,
  openBudgets,
  openTransactions,
  transactionRow,
} from '../support/app';
import { banner, tryDemo } from './demo-app';

test('a visitor tries the demo and finds a year of shared money', async ({ page }) => {
  const householdId = await tryDemo(page);

  await expect(banner(page)).toContainText('Demo data · deleted in 7 days');
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), John Doe$/ }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Balance' })).toContainText('Jane Doe');

  // This month has spending, and the history goes back eleven more months.
  await openTransactions(page, householdId);
  await expect(monthStat(page, 'Spent')).not.toHaveText(/^0\sFt$/);
  await openTransactions(page, householdId, monthOf(-11));
  await expect(transactionRow(page, 'Rent')).toBeVisible();

  await openBudgets(page, householdId);
  await expect(budgetRow(page, 'Eating out')).toBeVisible();

  // The bank history arrived as the visitor's monthly Revolut imports.
  await page.goto(`/h/${householdId}/transactions/import`);
  await expect(page.getByText(/^revolut-\d{4}-\d{2}\.csv/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText('Demo account')).toBeVisible();
});

test('Start over swaps the household for a fresh one', async ({ page }) => {
  const first = await tryDemo(page);

  await banner(page).getByRole('button', { name: 'Start over' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Start over?' });
  await dialog.getByRole('button', { name: 'Start over' }).click();
  await page.waitForURL(
    (url) => /^\/h\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(first),
  );
  await expect(banner(page)).toContainText('deleted in 7 days');

  // The old household is gone.
  await page.goto(`/h/${first}`);
  await expect(page.getByRole('heading', { name: 'Household not found' })).toBeVisible();
});

test('End demo deletes the household and returns to the landing page', async ({ page }) => {
  const householdId = await tryDemo(page);

  await endDemo(page);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();

  // Signed out: household pages lead back to the landing page.
  await page.goto(`/h/${householdId}`);
  await expect(page).toHaveURL('/');
});

test('the demo site has no login or registration', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL('/');
  await page.goto('/register');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
});

test('a sample export goes through the import', async ({ page }) => {
  const householdId = await tryDemo(page);
  await page.goto(`/h/${householdId}/transactions/import`);

  await page.getByRole('button', { name: 'No export at hand? Try a sample one' }).click();
  const ready = page.getByRole('region', { name: 'Ready to import' });
  await expect(ready.getByRole('listitem').first()).toBeVisible();
  await page.getByRole('button', { name: /^Import \d+ transactions?$/ }).click();
  await expect(page.getByText(/^\d+ transactions? imported$/).first()).toBeVisible();
});

async function endDemo(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'End demo' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'End the demo?' });
  await dialog.getByRole('button', { name: 'End demo' }).click();
}
