import { expect, test } from '@playwright/test';
import {
  addTransaction,
  field,
  fillTransaction,
  householdWithPartner,
  money,
  openOverview,
  openTransactions,
} from '../support/app';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as `YYYY-MM-DD` (local time, like the app). */
function today(): string {
  const date = new Date();
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test('the overview says what is left of the month once a salary is tracked', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // Nothing to measure against yet: the card offers to track a salary, opening on Income.
  await openOverview(page, householdId);
  await page.getByRole('link', { name: 'Add income' }).click();
  const income = page.getByRole('dialog', { name: 'Add recurring income' });
  await field(income, 'Name').fill('Salary');
  await field(income, 'Amount').fill('690000');
  // Today counts as the last time it arrived: nothing more is expected this month.
  await field(income, 'Next or last time it arrived').fill(today());
  await income.getByRole('button', { name: 'Only me' }).click();
  await income.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Recurring income added')).toBeVisible();
  await expect(page).toHaveURL(`/h/${householdId}`);

  // The salary itself, as it would come from the bank: now there is a month to measure.
  await openTransactions(page, householdId);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add transaction' })
    .getByRole('button', { name: 'Income' })
    .click();
  await fillTransaction(page, { amount: '690000', description: 'Salary', private: true });
  await openOverview(page, householdId);
  const left = page.getByRole('region', { name: 'Left this month' });
  await expect(left).toContainText(money('690 000 Ft'));

  // A shared 40 000 Ft takes Anna's half out of it.
  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '40000', description: 'Weekly shop' });
  await openOverview(page, householdId);
  await expect(left.getByRole('listitem').filter({ hasText: 'Spent' })).toContainText(
    money('20 000 Ft'),
  );
  await expect(left.getByRole('listitem').filter({ hasText: 'Left' })).toContainText(
    money('670 000 Ft'),
  );

  // The sum behind it opens on request.
  await left.getByRole('button', { name: 'How is this calculated' }).click();
  await expect(left.getByText('Income received')).toBeVisible();
  await expect(left.getByText(/Your share only/)).toBeVisible();

  // Ben sees nothing of Anna's salary: his card still asks for an income.
  await openOverview(partner, householdId);
  await expect(partner.getByRole('link', { name: 'Add income' })).toBeVisible();
  await expect(partner.getByRole('region', { name: 'Left this month' })).toHaveCount(0);

  await partnerContext.close();
});
