import { expect, type Page, test } from '@playwright/test';
import {
  addTransaction,
  balance,
  createHousehold,
  field,
  householdWithPartner,
  money,
  newUser,
  openOverview,
  openSettings,
  openTransactions,
  pickCategory,
  register,
  transactionRow,
} from '../support/app';
import { chooseExport, khExport, khPurchase } from '../support/bank';

/** The import page with an export chosen, waiting for its review. */
async function reviewExport(page: Page, householdId: string, content: string) {
  await page.goto(`/h/${householdId}/transactions/import`);
  await expect(page.getByRole('heading', { name: 'Import from your bank' })).toBeVisible();
  await chooseExport(page, content);
  await expect(page.getByRole('region', { name: 'Ready to import' })).toBeVisible();
}

/** Who a review row is for: the Shared / Just me switch, by the row's description. */
function whoFor(page: Page, description: string) {
  return page.getByRole('group', { name: `Who ${description} is for` });
}

/** The rules in Settings, in the order they apply. */
function ruleRows(page: Page) {
  return page.getByRole('link', { name: /^Contains / });
}

test('a rule suggested after an import categorizes the next one', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // The first import: Anna files the groceries by hand and shares them.
  await reviewExport(
    page,
    householdId,
    khExport([
      khPurchase({
        booked: '2026.10.05',
        paid: '2026/10/04',
        id: 'RUL-E2E-1',
        partner: 'TESCO 44049',
        amount: 6000,
      }),
    ]),
  );
  await pickCategory(page, 'Category of TESCO 44049', 'Groceries');
  await whoFor(page, 'TESCO 44049').getByRole('button', { name: 'Shared' }).click();
  await page.getByRole('button', { name: 'Import 1 transaction' }).click();
  await expect(page.getByText('1 transaction imported')).toBeVisible();

  // "Do the same next time?": the merchant without its branch number, already checked.
  const suggestions = page.getByRole('region', { name: 'Rule suggestions' });
  const suggestion = suggestions.getByRole('checkbox', { name: /Contains tesco/ });
  await expect(suggestion).toBeChecked();
  await expect(suggestions).toContainText('Groceries, shared');
  await suggestions.getByRole('button', { name: 'Create 1 rule' }).click();
  await expect(page.getByText('1 rule created')).toBeVisible();

  await openSettings(page, householdId);
  await expect(ruleRows(page)).toHaveCount(1);
  await expect(ruleRows(page)).toContainText('Groceries');
  await expect(ruleRows(page)).toContainText('Shared');

  // The next export has another Tesco: the rule picks the category and sharing.
  await reviewExport(
    page,
    householdId,
    khExport([
      khPurchase({
        booked: '2026.10.20',
        paid: '2026/10/19',
        id: 'RUL-E2E-2',
        partner: 'TESCO 44051',
        amount: 7400,
      }),
    ]),
  );
  await expect(page.getByText('By rule "tesco"')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Category of TESCO 44051' })).toContainText(
    'Groceries',
  );
  await expect(whoFor(page, 'TESCO 44051').getByRole('button', { name: 'Shared' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Import 1 transaction' }).click();
  await expect(page.getByText('1 transaction imported')).toBeVisible();
  // Nothing left to learn: the rule did it.
  await expect(page.getByRole('region', { name: 'Rule suggestions' })).toHaveCount(0);

  await openTransactions(page, householdId, '2026-10');
  await expect(transactionRow(page, 'TESCO 44051')).toContainText('Groceries');
  await expect(transactionRow(page, 'TESCO 44051')).toContainText(money('you 3700 Ft'));
  await openOverview(partner, householdId);
  await expect(balance(partner)).toContainText('You owe Anna');
  await expect(balance(partner)).toContainText(money('6700 Ft'));

  await partnerContext.close();
});

test('a rule added in settings categorizes earlier transactions and can be reordered and deleted', async ({
  page,
}) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '4490', description: 'Netflix' });
  await expect(transactionRow(page, 'Netflix')).not.toContainText('Entertainment');

  // A new rule offers the earlier match in its toast.
  await openSettings(page, householdId);
  await page.getByRole('link', { name: 'Add rule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add rule' });
  await field(dialog, 'When the merchant or description contains').fill('netflix');
  await pickCategory(dialog, 'Use category', 'Entertainment');
  await dialog.getByRole('button', { name: 'Add rule' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText('It matches 1 earlier transaction without a category.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('1 transaction categorized')).toBeVisible();

  await openTransactions(page, householdId);
  await expect(transactionRow(page, 'Netflix')).toContainText('Entertainment');

  // Rules apply in order: the newer one moves up, then the first one goes.
  await openSettings(page, householdId);
  await page.getByRole('link', { name: 'Add rule' }).click();
  await field(dialog, 'When the merchant or description contains').fill('spotify');
  await pickCategory(dialog, 'Use category', 'Entertainment');
  await dialog.getByRole('button', { name: 'Add rule' }).click();
  await expect(dialog).toBeHidden();
  await expect(ruleRows(page)).toHaveText([/netflix/, /spotify/]);

  await page.getByRole('button', { name: 'Actions for rule spotify' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(ruleRows(page)).toHaveText([/spotify/, /netflix/]);

  await page.getByRole('button', { name: 'Actions for rule netflix' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete the rule "netflix"?' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Rule deleted')).toBeVisible();
  await expect(ruleRows(page)).toHaveText([/spotify/]);

  // The transaction it categorized keeps its category.
  await openTransactions(page, householdId);
  await expect(transactionRow(page, 'Netflix')).toContainText('Entertainment');
});
