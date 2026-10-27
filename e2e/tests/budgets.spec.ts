import { expect, type Page, test } from '@playwright/test';
import {
  addTransaction,
  budgetRow,
  createHousehold,
  householdWithPartner,
  money,
  monthOf,
  newUser,
  openBudgets,
  openOverview,
  openTransactions,
  register,
  setBudget,
} from '../support/app';

/** A total above the budgets list: 'Budgeted', 'Spent', 'Left' or 'Over'. */
function budgetTotal(page: Page, label: 'Budgeted' | 'Spent' | 'Left' | 'Over') {
  return page.locator(`dt:text-is("${label}") + dd`);
}

test('a budget tracks shared spending and warns on the overview', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openBudgets(page, householdId);
  await setBudget(page, { category: 'Groceries', amount: '10000' });
  await expect(budgetRow(page, 'Groceries')).toContainText(money('10 000 Ft left'));

  // Only shared spending counts: the private snack stays out.
  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '8500', description: 'Weekly shop', category: 'Groceries' });
  await addTransaction(page, {
    amount: '5000',
    description: 'Snacks for me',
    category: 'Groceries',
    private: true,
  });
  await openBudgets(page, householdId);
  await expect(budgetRow(page, 'Groceries')).toContainText(money('1500 Ft left · 85%'));

  // Near the limit, it shows up on the overview.
  await openOverview(page, householdId);
  const alerts = page.locator('[data-slot=card]').filter({
    has: page.getByRole('heading', { name: 'Budgets this month' }),
  });
  await expect(alerts).toContainText('Groceries');
  await expect(alerts).toContainText(money('1500 Ft left · 85%'));

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '2000', description: 'Market', category: 'Groceries' });
  await openBudgets(page, householdId);
  await expect(budgetRow(page, 'Groceries')).toContainText(money('Over by 500 Ft'));
  await expect(budgetTotal(page, 'Over')).toHaveText(money('500 Ft'));

  // Budgets belong to the household: Ben sees the same one.
  await openBudgets(partner, householdId);
  await expect(budgetRow(partner, 'Groceries')).toContainText(money('Over by 500 Ft'));

  await partnerContext.close();
});

test('a changed budget holds from its month on, earlier months keep theirs', async ({ page }) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');
  const lastMonth = monthOf(-1);

  await openBudgets(page, householdId, lastMonth);
  await setBudget(page, { category: 'Groceries', amount: '10000' });
  await expect(budgetTotal(page, 'Budgeted')).toHaveText(money('10 000 Ft'));

  // It holds this month too, until changed here.
  await openBudgets(page, householdId);
  await expect(budgetRow(page, 'Groceries')).toContainText(money('10 000 Ft left'));
  await budgetRow(page, 'Groceries').getByRole('link').click();
  await setBudget(page, { amount: '15000' });
  await expect(budgetRow(page, 'Groceries')).toContainText(money('15 000 Ft left'));

  await openBudgets(page, householdId, lastMonth);
  await expect(budgetRow(page, 'Groceries')).toContainText(money('10 000 Ft left'));

  // Removing it from this month on leaves last month alone.
  await openBudgets(page, householdId);
  await budgetRow(page, 'Groceries').getByRole('link').click();
  const dialog = page.getByRole('dialog', { name: 'Change budget' });
  await dialog.getByRole('button', { name: 'Remove budget' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Budget removed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set a budget' })).toBeVisible();
  await expect(budgetRow(page, 'Groceries')).toHaveCount(0);

  await openBudgets(page, householdId, lastMonth);
  await expect(budgetRow(page, 'Groceries')).toContainText(money('10 000 Ft left'));
});
