import { expect, type Page, test } from '@playwright/test';
import {
  addTransaction,
  balance,
  householdWithPartner,
  money,
  openOverview,
  openTransactions,
  transactionRow,
} from '../support/app';

/**
 * A made-up K&H transaction history export (tab separated, like the real one) for an
 * account holder called Kovács Anna. Every value is invented.
 */
const KH_EXPORT = [
  [
    'könyvelés dátuma',
    'tranzakció azonosító ',
    'típus',
    'könyvelési számla',
    'könyvelési számla elnevezése',
    'partner számla',
    'partner elnevezése',
    'összeg',
    'összeg devizaneme',
    'közlemény',
  ],
  [
    '2026.10.12',
    'MSV-E2E-1',
    'Vásárlás belföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'Pizza Place',
    '-9550',
    'HUF',
    'Ref.: MSV-E2E-1 2026/10/10 Pizza Place,HUN',
  ],
  [
    '2026.10.12',
    '544537******0',
    'bankkártya tranzakció foglalás',
    '104',
    'KOVÁCS ANNA',
    '',
    'Selecta SAS    Le Bourget   FR',
    '-773.00',
    '',
    '',
  ],
  [
    '2026.10.08',
    'MSV-E2E-2',
    'Vásárlás külföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'APPLE.COM/BILL',
    '-15000',
    'HUF',
    'Ref.: MSV-E2E-2 2026/10/08 APPLE.COM/BILL,IRL',
  ],
  [
    '2026.10.07',
    'MSV-E2E-3',
    'Vásárlás külföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'Revolut 1234',
    '-12320',
    'HUF',
    'Ref.: MSV-E2E-3 2026/10/06 Revolut 1234,IRL',
  ],
  [
    '2026.10.05',
    'MSV-E2E-4',
    'Vásárlás belföldi kereskedőnél',
    '104',
    'KOVÁCS ANNA',
    '',
    'TESCO 44049',
    '-6000',
    'HUF',
    'Ref.: MSV-E2E-4 2026/10/04 TESCO 44049,HUN',
  ],
]
  .map((cells) => cells.join('\t'))
  .join('\r\n');

async function chooseExport(page: Page) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'kh-export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(KH_EXPORT, 'utf8'),
  });
}

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
  await chooseExport(page);

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
  await chooseExport(page);
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
