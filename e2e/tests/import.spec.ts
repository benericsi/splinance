import { expect, test } from '@playwright/test';
import {
  addTransaction,
  balance,
  householdWithPartner,
  money,
  openOverview,
  openTransactions,
  transactionRow,
} from '../support/app';
import { chooseExport, khExport, khPurchase } from '../support/bank';

/** Five rows: a duplicate of a hand-entered one, a card hold, a subscription, a top-up, groceries. */
const KH_EXPORT = khExport([
  khPurchase({
    booked: '2026.10.12',
    paid: '2026/10/10',
    id: 'MSV-E2E-1',
    partner: 'Pizza Place',
    amount: 9550,
  }),
  {
    booked: '2026.10.12',
    id: '544537******0',
    type: 'bankkártya tranzakció foglalás',
    partner: 'Selecta SAS    Le Bourget   FR',
    amount: '-773.00',
    currency: '',
    note: '',
  },
  {
    booked: '2026.10.08',
    id: 'MSV-E2E-2',
    type: 'Vásárlás külföldi kereskedőnél',
    partner: 'APPLE.COM/BILL',
    amount: '-15000',
    currency: 'HUF',
    note: 'Ref.: MSV-E2E-2 2026/10/08 APPLE.COM/BILL,IRL',
  },
  {
    booked: '2026.10.07',
    id: 'MSV-E2E-3',
    type: 'Vásárlás külföldi kereskedőnél',
    partner: 'Revolut 1234',
    amount: '-12320',
    currency: 'HUF',
    note: 'Ref.: MSV-E2E-3 2026/10/06 Revolut 1234,IRL',
  },
  khPurchase({
    booked: '2026.10.05',
    paid: '2026/10/04',
    id: 'MSV-E2E-4',
    partner: 'TESCO 44049',
    amount: 6000,
  }),
]);

test('a bank export is reviewed, imported, recognized again and undone', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // Anna typed in one purchase by hand already.
  await openTransactions(page, householdId);
  await addTransaction(page, {
    amount: '9550',
    description: 'Pizza night',
    occurredOn: '2026-10-09',
    private: true,
  });

  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page.getByRole('heading', { name: 'Import from your bank' })).toBeVisible();
  await chooseExport(page, KH_EXPORT);

  // Grouped by decision: the hand-entered pizza and the Revolut top-up need a look.
  const needsLook = page.getByRole('region', { name: 'Needs a look' });
  await expect(needsLook.getByRole('listitem').filter({ hasText: 'Pizza Place' })).toContainText(
    'Maybe already added: "Pizza night"',
  );
  await expect(needsLook.getByRole('listitem').filter({ hasText: 'Revolut 1234' })).toContainText(
    'Looks like a transfer between your own accounts',
  );
  const ready = page.getByRole('region', { name: 'Ready to import' });
  await expect(ready.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Left out: 1 not booked yet')).toBeVisible();
  await expect(page.getByLabel('Your name at the bank')).toHaveValue('KOVÁCS ANNA');

  // Groceries are shared, the subscription gets a clearer name.
  const tesco = ready.getByRole('listitem').filter({ hasText: /4 Oct/ });
  await tesco.getByRole('button', { name: 'Shared' }).click();
  await ready.getByLabel('Description of APPLE.COM/BILL').fill('iCloud');
  await page.getByRole('button', { name: 'Import 2 transactions' }).click();
  await expect(page.getByText('2 transactions imported')).toBeVisible();

  // The rows are ordinary transactions now; Ben owes half of the shared groceries.
  await openTransactions(page, householdId, '2026-10');
  await expect(transactionRow(page, 'iCloud')).toContainText(money('15 000 Ft'));
  await expect(transactionRow(page, 'TESCO 44049')).toContainText(money('you 3000 Ft'));
  await openOverview(partner, householdId);
  await expect(balance(partner)).toContainText('You owe Anna');
  await expect(balance(partner)).toContainText(money('3000 Ft'));

  // The same file again: what was imported is recognized and left out.
  await page.goto(`/h/${householdId}/transactions/import`);
  await chooseExport(page, KH_EXPORT);
  await expect(page.getByText('Left out: 1 not booked yet, 2 already imported')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ready to import' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled();

  // Undo the import from the history: both rows go, and so does Ben's debt.
  await page.goto(`/h/${householdId}/transactions/import`);
  const history = page.getByRole('listitem').filter({ hasText: 'K&H' });
  await expect(history).toContainText('2 transactions');
  await history.getByRole('button', { name: 'Undo' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Undo this import?' });
  await confirm.getByRole('button', { name: 'Undo import' }).click();
  await expect(page.getByText('Import undone')).toBeVisible();
  await expect(history).toContainText('undone');

  await openTransactions(page, householdId, '2026-10');
  await expect(transactionRow(page, 'Pizza night')).toBeVisible();
  await expect(transactionRow(page, 'iCloud')).toHaveCount(0);
  await partner.reload();
  await expect(balance(partner)).toContainText("You're all square");

  await partnerContext.close();
});

test('a file that is not a bank export is explained', async ({ page, browser }) => {
  const { householdId, partnerContext } = await householdWithPartner(page, browser);
  await page.goto(`/h/${householdId}/transactions/import`);
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date;amount\n2026-10-01;5', 'utf8'),
  });
  await expect(page.getByText(/not a Revolut or K&H export/)).toBeVisible();
  await partnerContext.close();
});
