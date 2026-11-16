import { expect, test } from '@playwright/test';
import {
  createHousehold,
  field,
  fillTransaction,
  money,
  newUser,
  openOverview,
  openTransactions,
  register,
} from '../support/app';

/** The first of the month a year from now: eleven or twelve whole months away. */
function aYearAhead(): string {
  const now = new Date();
  return `${String(now.getFullYear() + 1)}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

test('a monthly plan says whether a goal gets there, keeps money back, and survives a reopen', async ({
  page,
}) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');

  // A salary to measure the month against.
  await openTransactions(page, householdId);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add transaction' })
    .getByRole('button', { name: 'Income' })
    .click();
  await fillTransaction(page, { amount: '600000', description: 'Salary', private: true });

  // A goal with a target and a date, nothing in it yet.
  await page.goto(`/h/${householdId}/savings/new`);
  const create = page.getByRole('dialog', { name: 'New goal' });
  await field(create, 'Name').fill('New car');
  await field(create, 'Target').fill('1200000');
  await field(create, 'Target date').fill(aYearAhead());
  await create.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByText('Goal created')).toBeVisible();

  // Planning less than the pace asks for says "Behind", enough says "On track".
  await page.getByRole('link', { name: 'New car', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New car' });
  const plan = dialog.getByRole('region', { name: 'Your plan' });
  await plan.getByRole('button', { name: 'Plan a monthly amount' }).click();
  await plan.getByLabel('Each month').fill('50000');
  await plan.getByRole('button', { name: 'Save' }).click();
  await expect(plan).toContainText(money('You put in 50 000 Ft a month'));
  await expect(dialog).toContainText(/Behind: /);
  await plan.getByRole('button', { name: 'Change' }).click();
  await plan.getByLabel('Each month').fill('120000');
  await plan.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText(money('On track with 120 000 Ft a month planned'));
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  // The overview keeps the planned money back from the month.
  await openOverview(page, householdId);
  const left = page.getByRole('region', { name: 'Left this month' });
  await expect(left.getByRole('listitem').filter({ hasText: 'To set aside' })).toContainText(
    money('120 000 Ft'),
  );
  await expect(left).toContainText(money('480 000 Ft'));

  // Closing removes the plan; reopening brings the goal back without it.
  await page.goto(`/h/${householdId}/savings`);
  await page.getByRole('link', { name: 'New car', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Close goal' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close goal' }).click();
  await expect(page.getByText('Goal closed')).toBeVisible();
  await page.getByRole('button', { name: 'Closed goals (1)' }).click();
  await page.getByRole('link', { name: 'New car', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reopen goal' }).click();
  await expect(page.getByText('Goal reopened')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Your plan' })).toContainText(
    'No monthly amount planned',
  );
});
