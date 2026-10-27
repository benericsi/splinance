import { expect, test } from '@playwright/test';
import { addTransaction, householdWithPartner, money, openTransactions } from '../support/app';

test('reports show the month by category, for the household or one person', async ({
  page,
  browser,
}) => {
  const { householdId, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await addTransaction(page, {
    amount: '12000',
    description: 'Weekly shop',
    category: 'Groceries',
  });
  await addTransaction(page, { amount: '6000', description: 'Pizza', category: 'Eating out' });
  await addTransaction(page, {
    amount: '2000',
    description: 'Snacks for me',
    category: 'Groceries',
    private: true,
  });

  await page.getByRole('link', { name: 'Reports' }).first().click();
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();

  // Household: shared spending plus Anna's own private snack.
  const list = page.getByRole('list', { name: /^Spending by category in/ });
  await expect(list.getByRole('listitem')).toHaveText([
    /Groceries.*14\s000\sFt · 70%/,
    /Eating out.*6000\sFt · 30%/,
  ]);
  // The cards above sum up the month; nothing to compare with in a new household.
  await expect(page.getByRole('region', { name: 'Spent' })).toContainText(money('20 000 Ft'));
  await expect(page.getByRole('region', { name: 'Top category' })).toContainText('Groceries');
  const months = page.getByRole('table', { name: 'Spent and income per month' });
  await expect(months.getByRole('row')).toHaveCount(7);
  await expect(months.getByRole('row').last()).toContainText(money('20 000 Ft'));

  // Her share: half of each shared purchase, all of the private one.
  await page
    .getByRole('group', { name: 'Whose spending' })
    .getByRole('button', { name: 'Your share' })
    .click();
  await expect(list.getByRole('listitem')).toHaveText([
    /Groceries.*8000\sFt · 73%/,
    /Eating out.*3000\sFt · 27%/,
  ]);

  // The year so far adds up the same purchases (all made this month).
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Year' }).click();
  const year = String(new Date().getFullYear());
  await expect(page.getByRole('heading', { name: `By category · ${year} so far` })).toBeVisible();
  await expect(months.getByRole('row')).toHaveCount(13);
  await expect(list.getByRole('listitem')).toHaveText([
    /Groceries.*8000\sFt · 73%/,
    /Eating out.*3000\sFt · 27%/,
  ]);

  await partnerContext.close();
});
