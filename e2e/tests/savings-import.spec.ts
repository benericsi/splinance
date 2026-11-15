import { expect, test } from '@playwright/test';
import { createHousehold, field, money, newUser, register } from '../support/app';
import { chooseExport, revolutExport } from '../support/bank';

const pocketMonth = (month: string, amount: number) =>
  revolutExport([
    {
      type: 'Card Payment',
      started: `2026-${month}-03 12:10:00`,
      description: 'Lidl',
      amount: -8_400,
    },
    {
      type: 'Transfer',
      started: `2026-${month}-05 06:30:00`,
      description: 'To pocket HUF Italy trip from HUF',
      amount: -amount,
    },
  ]);

test('a pocket transfer goes into a goal, and the next one is filled in by the rule', async ({
  page,
}) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');

  await page.goto(`/h/${householdId}/savings/new`);
  const dialog = page.getByRole('dialog', { name: 'New goal' });
  await field(dialog, 'Name').fill('Summer in Italy');
  await field(dialog, 'Target').fill('600000');
  await dialog.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByText('Goal created')).toBeVisible();

  // September: the pocket transfer is not spending, so it goes to the goal by hand.
  await page.goto(`/h/${householdId}/transactions/import`);
  await chooseExport(page, pocketMonth('09', 30_000), 'revolut-2026-09.csv');
  const ready = page.getByRole('region', { name: 'Ready to import' });
  const pocketRow = (scope: typeof ready) =>
    scope
      .getByRole('listitem')
      .filter({ has: page.getByLabel('Description of To pocket HUF Italy trip from HUF') });
  const pocket = pocketRow(ready);
  await pocket.getByRole('button', { name: 'Savings' }).click();
  await expect(page.getByText('Pick a goal for 1 savings row')).toBeVisible();
  await pocket.getByRole('combobox', { name: /^Goal of/ }).click();
  await page.getByRole('option', { name: 'Summer in Italy' }).click();
  await expect(pocket).toContainText('Into savings, not spending');
  await page.getByRole('button', { name: 'Import 2 rows' }).click();
  await expect(page.getByText('1 transaction imported')).toBeVisible();
  await expect(page.getByText('1 went to savings.')).toBeVisible();

  // Do the same next time: a savings rule for the pocket.
  const suggestions = page.getByRole('region', { name: 'Rule suggestions' });
  await expect(suggestions).toContainText('Savings: Summer in Italy');
  await suggestions.getByRole('button', { name: 'Create 1 rule' }).click();
  await expect(page.getByText('1 rule created')).toBeVisible();

  // October: the rule sends the transfer to the goal by itself.
  await page.getByRole('button', { name: 'Import another file' }).click();
  await chooseExport(page, pocketMonth('10', 25_000), 'revolut-2026-10.csv');
  const byRule = pocketRow(page.getByRole('region', { name: 'Ready to import' }));
  await expect(byRule).toContainText(/By savings rule/);
  await expect(byRule.getByRole('button', { name: 'Savings' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Import 2 rows' }).click();
  await expect(page.getByText('1 went to savings.')).toBeVisible();

  // The goal holds both months; the transactions list has only the groceries.
  await page.getByRole('link', { name: 'View savings' }).click();
  await expect(page.getByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(money('55 000 Ft'));
  await page.goto(`/h/${householdId}/transactions?month=2026-10`);
  await expect(page.getByRole('main')).not.toContainText('pocket');
});
