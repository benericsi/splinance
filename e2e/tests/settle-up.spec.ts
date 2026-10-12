import { expect, type Page, test } from '@playwright/test';
import {
  addTransaction,
  balance,
  householdWithPartner,
  money,
  openOverview,
  openTransactions,
  recordPayment,
} from '../support/app';

/** Leave from household settings; returns the confirmation dialog. */
async function tryToLeave(page: Page, householdId: string) {
  await page.goto(`/h/${householdId}/settings`);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Leave Home?' });
  await confirm.getByRole('button', { name: 'Leave', exact: true }).click();
  return confirm;
}

test('a partner settles a debt in two payments, then can leave', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // Anna pays two shared bills, split equally: Ben owes her 2500 + 3500.
  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '5000', description: 'Groceries' });
  await addTransaction(page, { amount: '7000', description: 'Electricity' });

  await openOverview(partner, householdId);
  await expect(balance(partner)).toContainText('You owe Anna');
  await expect(balance(partner)).toContainText(money('6000 Ft'));

  // Leaving with an open debt is refused, with the reason in the dialog.
  const refused = await tryToLeave(partner, householdId);
  await expect(
    refused.getByText('Settle your balances before leaving the household'),
  ).toBeVisible();
  await refused.getByRole('button', { name: 'Cancel' }).click();

  // A partial payment leaves the rest open.
  await openOverview(partner, householdId);
  await recordPayment(partner, {
    amount: '4000',
    hint: money('After this, you still owe Anna 2000 Ft'),
    note: 'cash',
  });
  await expect(balance(partner)).toContainText(money('2000 Ft'));

  // Anna sees the same balance and the payment.
  await openOverview(page, householdId);
  await expect(balance(page)).toContainText('Ben owes you');
  await expect(balance(page)).toContainText(money('2000 Ft'));
  const history = page.getByRole('listitem').filter({ hasText: 'Ben paid you' });
  await expect(history).toContainText('cash');
  await expect(history).toContainText(money('4000 Ft'));

  // The rest is prefilled; paying it squares them up.
  await recordPayment(partner, { hint: "You're all square after this" });
  await expect(balance(partner)).toContainText("You're all square");

  // Now Ben can leave.
  await tryToLeave(partner, householdId);
  await expect(partner.getByText('You left Home')).toBeVisible();
  await expect(partner).toHaveURL('/welcome');

  await partnerContext.close();
});

test('deleting a payment reopens the debt, undo closes it again', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '3000', description: 'Pizza' });

  // Ben pays his half back.
  await openOverview(partner, householdId);
  await recordPayment(partner);
  await expect(balance(partner)).toContainText("You're all square");

  // Anna deletes it by mistake and undoes it.
  await openOverview(page, householdId);
  await expect(balance(page)).toContainText("You're all square");
  const payment = page.getByRole('listitem').filter({ hasText: 'Ben paid you' });
  await payment.getByRole('button', { name: 'Payment actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByText('Payment deleted')).toBeVisible();
  await expect(balance(page)).toContainText('Ben owes you');
  await expect(balance(page)).toContainText(money('1500 Ft'));
  await expect(payment).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(balance(page)).toContainText("You're all square");
  await expect(payment).toBeVisible();

  // Ben sees the restored payment too.
  await partner.reload();
  await expect(balance(partner)).toContainText("You're all square");

  await partnerContext.close();
});
