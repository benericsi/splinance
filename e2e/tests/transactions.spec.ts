import { expect, test } from '@playwright/test';
import {
  addTransaction,
  field,
  householdWithPartner,
  money,
  monthStat,
  openTransactions,
  transactionRow,
} from '../support/app';

test('a shared expense split by percentage shows up for the partner', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await expect(page.getByRole('heading', { name: 'Add your first transaction' })).toBeVisible();
  // 60 % of 10 001 is 6000.6 and 40 % is 4000.4: the leftover unit goes to the larger
  // remainder, so the shares still add up to the total.
  await addTransaction(page, {
    amount: '10001',
    description: 'Groceries',
    percentages: { You: '60', Ben: '40' },
  });

  const row = transactionRow(page, 'Groceries');
  await expect(row).toContainText('You paid · 60 / 40 %');
  await expect(row).toContainText(money('10 001 Ft'));
  await expect(row).toContainText(money('you 6001 Ft'));
  await expect(monthStat(page, 'Spent')).toContainText(money('10 001 Ft'));
  await expect(monthStat(page, 'Your share')).toContainText(money('6001 Ft'));

  // Ben sees the same expense from his side.
  await openTransactions(partner, householdId);
  const partnerRow = transactionRow(partner, 'Groceries');
  await expect(partnerRow).toContainText('Anna paid');
  await expect(partnerRow).toContainText(money('you 4000 Ft'));
  await expect(monthStat(partner, 'Spent')).toContainText(money('10 001 Ft'));
  await expect(monthStat(partner, 'Your share')).toContainText(money('4000 Ft'));

  // The edit dialog opens with the split as it was entered.
  await partnerRow.click();
  const dialog = partner.getByRole('dialog', { name: 'Edit transaction' });
  await expect(field(dialog, 'Amount')).toHaveValue(money('10 001'));
  await expect(dialog.getByRole('textbox', { name: 'Percent for You' })).toHaveValue('40');
  await expect(dialog.getByRole('textbox', { name: 'Percent for Anna' })).toHaveValue('60');

  await partnerContext.close();
});

test('a private expense stays invisible to the partner', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '3000', description: 'Pizza' });
  await addTransaction(page, { amount: '2500', description: 'Birthday gift', private: true });

  const gift = transactionRow(page, 'Birthday gift');
  await expect(gift.getByLabel('Private')).toBeVisible();
  await expect(gift).toContainText('Just you');
  // Anna's totals include her private expense in full and half of the pizza.
  await expect(monthStat(page, 'Spent')).toContainText(money('5500 Ft'));
  await expect(monthStat(page, 'Your share')).toContainText(money('4000 Ft'));
  const giftPath = await gift.getAttribute('href');
  expect(giftPath).toMatch(new RegExp(`^/h/${householdId}/transactions/[^/]+$`));

  // Ben sees the shared pizza only, in the list and in the totals.
  await openTransactions(partner, householdId);
  await expect(transactionRow(partner, 'Pizza')).toBeVisible();
  await expect(transactionRow(partner, 'Birthday gift')).toHaveCount(0);
  await expect(monthStat(partner, 'Spent')).toContainText(money('3000 Ft'));
  await expect(monthStat(partner, 'Your share')).toContainText(money('1500 Ft'));

  // A direct link to it is a dead end for him, exactly like an id that never existed.
  await partner.goto(giftPath ?? '');
  await expect(partner.getByText('That transaction does not exist any more.')).toBeVisible();
  await expect(partner).toHaveURL(`/h/${householdId}/transactions`);
  await expect(partner.getByRole('dialog')).toBeHidden();

  await partnerContext.close();
});

test('saving over a newer version offers to load it instead of overwriting', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '3000', description: 'Pizza' });

  // Both open the same version.
  await transactionRow(page, 'Pizza').click();
  const dialog = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(field(dialog, 'Description')).toHaveValue('Pizza');

  await openTransactions(partner, householdId);
  await transactionRow(partner, 'Pizza').click();
  const partnerDialog = partner.getByRole('dialog', { name: 'Edit transaction' });
  await field(partnerDialog, 'Description').fill('Pizza and drinks');
  await partnerDialog.getByRole('button', { name: 'Save' }).click();
  await expect(partner.getByText('Transaction saved')).toBeVisible();
  await expect(partnerDialog).toBeHidden();

  // Anna's save is based on the old version: refused, nothing overwritten.
  await field(dialog, 'Amount').fill('3600');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Someone else saved a change to this transaction.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

  // Loading the latest version shows Ben's change; editing it again works.
  await dialog.getByRole('button', { name: 'Load latest version' }).click();
  await expect(field(dialog, 'Description')).toHaveValue('Pizza and drinks');
  await expect(field(dialog, 'Amount')).toHaveValue('3000');
  await field(dialog, 'Amount').fill('3600');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Transaction saved')).toBeVisible();
  await expect(dialog).toBeHidden();

  // Both changes survived.
  await expect(transactionRow(page, 'Pizza and drinks')).toContainText(money('3600 Ft'));
  await partner.reload();
  await expect(transactionRow(partner, 'Pizza and drinks')).toContainText(money('you 1800 Ft'));

  await partnerContext.close();
});

test('a deleted transaction can be restored with undo', async ({ page, browser }) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '4000', description: 'Taxi' });
  await addTransaction(page, { amount: '1200', description: 'Coffee' });

  const deleteTaxi = async () => {
    await transactionRow(page, 'Taxi').click();
    const dialog = page.getByRole('dialog', { name: 'Edit transaction' });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Transaction deleted')).toBeVisible();
    await expect(transactionRow(page, 'Taxi')).toBeHidden();
    await expect(monthStat(page, 'Spent')).toContainText(money('1200 Ft'));
  };

  await deleteTaxi();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(transactionRow(page, 'Taxi')).toBeVisible();
  await expect(monthStat(page, 'Spent')).toContainText(money('5200 Ft'));

  // Restored for Ben too.
  await openTransactions(partner, householdId);
  await expect(transactionRow(partner, 'Taxi')).toBeVisible();

  // Without undo it stays deleted, also after a reload and for Ben.
  await deleteTaxi();
  await page.reload();
  await expect(transactionRow(page, 'Coffee')).toBeVisible();
  await expect(transactionRow(page, 'Taxi')).toHaveCount(0);
  await partner.reload();
  await expect(transactionRow(partner, 'Coffee')).toBeVisible();
  await expect(transactionRow(partner, 'Taxi')).toHaveCount(0);

  await partnerContext.close();
});
