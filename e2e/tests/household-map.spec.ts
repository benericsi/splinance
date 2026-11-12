import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  addTransaction,
  createHousehold,
  field,
  householdWithPartner,
  money,
  newUser,
  openOverview,
  openTransactions,
  register,
} from '../support/app';
import { khExport, khPurchase } from '../support/bank';

const KH_EXPORT = khExport([
  khPurchase({
    booked: '2026.10.05',
    paid: '2026/10/04',
    id: 'MSV-MAP-1',
    partner: 'TESCO 44049',
    amount: 6000,
  }),
]);

/** The canvas, once React Flow has measured and placed its nodes. */
async function openMap(page: Page, householdId: string): Promise<Locator> {
  await page.goto(`/h/${householdId}?view=map`);
  const map = page.getByRole('region', { name: 'Household map' });
  await expect(map.locator('.react-flow__node').first()).toBeVisible();
  return map;
}

/** A node of the map (React Flow's wrapper, the thing that moves), by what its card says. */
function node(map: Locator, text: string | RegExp) {
  return map.locator('.react-flow__node').filter({ hasText: text });
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with real pointer events, in steps: the canvas only follows a pointer that moves. */
async function drag(page: Page, from: Locator, to: Locator) {
  const start = await center(from);
  const end = await center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

test('the overview as a map: people, a debt, and settling it by a drop', async ({
  page,
  browser,
}) => {
  const { householdId, partnerContext } = await householdWithPartner(page, browser);

  // Anna pays a shared bill: Ben owes her half.
  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '5000', description: 'Groceries' });

  // From the cards to the map; the choice lives in the URL.
  await openOverview(page, householdId);
  await page
    .getByRole('group', { name: 'Overview layout' })
    .getByRole('button', { name: 'Map' })
    .click();
  await expect(page).toHaveURL(`/h/${householdId}?view=map`);
  const map = page.getByRole('region', { name: 'Household map' });
  await expect(node(map, 'Anna (you)')).toContainText(money("You're owed 2500 Ft"));
  await expect(node(map, 'Ben')).toContainText(money('Owes 2500 Ft'));
  await expect(node(map, 'Home')).toContainText('2 members');
  // The debt is an edge with its amount.
  await expect(map.locator('.react-flow__edge').filter({ hasText: money('2500 Ft') })).toHaveCount(
    1,
  );

  // Full screen: everything beside the sidebar, top to bottom, and no library label.
  const viewport = page.viewportSize();
  const box = await map.boundingBox();
  const sidebar = await page.locator('aside').boundingBox();
  expect(box?.height).toBe(viewport?.height);
  expect(box?.width).toBe((viewport?.width ?? 0) - (sidebar?.width ?? 0));
  await expect(map.locator('.react-flow__attribution')).toHaveCount(0);

  // Moving a card somewhere empty just moves it: nothing opens.
  const anna = node(map, 'Anna (you)');
  const before = await center(anna);
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x - 40, before.y - 60, { steps: 6 });
  await page.mouse.up();
  expect((await center(anna)).y).toBeLessThan(before.y - 30);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Dropping yourself on Ben opens settle up with him, prefilled; the card goes back.
  const moved = await center(anna);
  await drag(page, anna, node(map, 'Ben'));
  const dialog = page.getByRole('dialog', { name: 'Settle up' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/h/${householdId}/settle\\?view=map&with=`));
  await expect(field(dialog, 'Amount')).toHaveValue('2500');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Payment recorded')).toBeVisible();

  // Back on the map, with the debt gone.
  await expect(page).toHaveURL(`/h/${householdId}?view=map`);
  await expect(node(map, 'Ben')).toContainText('All square');
  await expect(map.locator('.react-flow__edge').filter({ hasText: 'Ft' })).toHaveCount(0);
  const back = await center(anna);
  expect(Math.abs(back.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(back.y - moved.y)).toBeLessThan(2);

  // The same without a pointer: Ben's card is a link.
  await map.getByRole('link', { name: /Ben/ }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(`/h/${householdId}?view=map`);

  await partnerContext.close();
});

test('a bank export dropped on the map is imported and becomes a bank node', async ({ page }) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');
  const map = await openMap(page, householdId);
  await expect(node(map, 'K&H')).toHaveCount(0);

  // A file dragged in from the desktop: the map says what a drop will do, then does it.
  const dataTransfer = await page.evaluateHandle((content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], 'kh-export.csv', { type: 'text/csv' }));
    return transfer;
  }, KH_EXPORT);
  await map.dispatchEvent('dragover', { dataTransfer });
  await expect(page.getByText('Drop the bank export to import it')).toBeVisible();
  await map.dispatchEvent('drop', { dataTransfer });

  // The import page opens with the file already read.
  await expect(page).toHaveURL(`/h/${householdId}/transactions/import`);
  const ready = page.getByRole('region', { name: 'Ready to import' });
  await expect(ready.getByLabel('Description of TESCO 44049')).toHaveValue('TESCO 44049');
  await page.getByRole('button', { name: 'Import 1 transaction' }).click();
  await expect(page.getByText('1 transaction imported')).toBeVisible();

  // The bank is on the map now, and leads back to the import page.
  await openMap(page, householdId);
  await expect(node(map, 'K&H')).toContainText('Imported today');
  await node(map, 'K&H').getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Import from your bank' })).toBeVisible();
});

test('the Add menu opens a dialog over its page and closing comes back to the map', async ({
  page,
}) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');
  await openMap(page, householdId);

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // Alone in the household there is nobody to settle with; an owner can invite.
  await expect(page.getByRole('menuitem')).toHaveText([
    'Transaction',
    'Bank import',
    'Recurring payment',
    'Budget',
    'Invite someone',
  ]);
  await page.getByRole('menuitem', { name: 'Transaction' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(`/h/${householdId}?view=map`);
  await expect(page.getByRole('region', { name: 'Household map' })).toBeVisible();
});
