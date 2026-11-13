import { expect, type Page, test } from '@playwright/test';
import {
  field,
  fillTransaction,
  householdWithPartner,
  money,
  openOverview,
  openTransactions,
} from '../support/app';

/** The savings page, reached like a person would: from the sidebar. */
async function openSavings(page: Page, householdId: string) {
  await page.goto(`/h/${householdId}/savings`);
  await expect(page.getByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();
}

/** A goal shown large: one of the viewer's pins, or the one picked for them. */
function goalBox(page: Page, name: string) {
  return page.locator('[data-slot=card]').filter({
    has: page.getByRole('heading', { name, level: 2 }),
  });
}

async function createGoal(page: Page, goal: { name: string; target?: string; justMe?: boolean }) {
  await page
    .getByRole('link', { name: /^(New goal|Create a goal)$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'New goal' });
  await field(dialog, 'Name').fill(goal.name);
  if (goal.target) await field(dialog, 'Target').fill(goal.target);
  if (goal.justMe) await dialog.getByRole('button', { name: 'Just me' }).click();
  await dialog.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByText('Goal created')).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Opens the goal's dialog from its name, records one entry and closes it again. */
async function recordEntry(page: Page, goal: string, entry: { amount: string; takeOut?: boolean }) {
  await page.getByRole('link', { name: goal, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: goal });
  if (entry.takeOut) await dialog.getByRole('button', { name: 'Take out' }).first().click();
  await field(dialog, 'Amount').fill(entry.amount);
  await dialog
    .getByRole('button', { name: entry.takeOut ? 'Take out' : 'Add money' })
    .last()
    .click();
  await expect(
    page.getByText(entry.takeOut ? `Taken out of ${goal}` : `Added to ${goal}`),
  ).toBeVisible();
  return dialog;
}

test('a couple saves for a goal, and what is set aside leaves the month', async ({
  page,
  browser,
}) => {
  const { householdId, partner, partnerContext } = await householdWithPartner(page, browser);

  // A month to measure against: Anna's salary.
  await openTransactions(page, householdId);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add transaction' })
    .getByRole('button', { name: 'Income' })
    .click();
  await fillTransaction(page, { amount: '650000', description: 'Salary', private: true });

  // The sidebar leads to an empty page that offers a first goal.
  await page
    .getByRole('navigation', { name: 'Household sections' })
    .getByRole('link', { name: 'Savings' })
    .click();
  await expect(page.getByRole('heading', { name: 'Nothing set aside yet' })).toBeVisible();
  await createGoal(page, { name: 'Summer in Italy', target: '600000' });

  // Nothing pinned: the page picks it, and says so.
  const trip = goalBox(page, 'Summer in Italy');
  await expect(trip).toContainText(money('150 000 Ft to 25%'));
  await expect(page.getByText('Picked for you. Pin a goal to keep it on top.')).toBeVisible();

  // Anna puts money in: the first milestone is passed, the next one named.
  const dialog = await recordEntry(page, 'Summer in Italy', { amount: '160000' });
  // In the history, under her own name.
  await expect(
    dialog.getByRole('listitem').filter({ hasText: money('+160 000 Ft') }),
  ).toContainText('You');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trip).toContainText(money('140 000 Ft to 50%'));
  await expect(trip.getByText('1 of 4 milestones reached')).toBeAttached();

  // Ben sees the shared goal and adds his part.
  await openSavings(partner, householdId);
  await recordEntry(partner, 'Summer in Italy', { amount: '90000' });
  await partner.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  const bensTrip = goalBox(partner, 'Summer in Italy');
  await expect(bensTrip).toContainText(money('250 000 Ft'));
  await expect(bensTrip.getByRole('listitem').filter({ hasText: 'Anna' })).toContainText(
    money('160 000 Ft'),
  );
  await expect(bensTrip.getByRole('listitem').filter({ hasText: 'You' })).toContainText(
    money('90 000 Ft'),
  );

  // A private goal stays Anna's: Ben's page never shows it.
  await openSavings(page, householdId);
  await createGoal(page, { name: 'Surprise for Ben', target: '100000', justMe: true });
  await openSavings(partner, householdId);
  await expect(partner.getByText('Summer in Italy')).toBeVisible();
  await expect(partner.getByText('Surprise for Ben')).toHaveCount(0);

  // Pinning is hers alone: her private goal leads on her page, Ben's stays as it was.
  await page.getByRole('button', { name: 'Pin Surprise for Ben' }).click();
  await expect(goalBox(page, 'Surprise for Ben')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Summer in Italy', level: 3 })).toBeVisible();
  await expect(page.getByText(/Picked for you/)).toHaveCount(0);
  await partner.reload();
  await expect(goalBox(partner, 'Summer in Italy')).toBeVisible();

  // The overview: what Anna set aside is out of her month, and her pin is on the card.
  await openOverview(page, householdId);
  const left = page.getByRole('region', { name: 'Left this month' });
  await expect(left.getByRole('listitem').filter({ hasText: 'Set aside' })).toContainText(
    money('160 000 Ft'),
  );
  await expect(left.getByRole('listitem').filter({ hasText: 'Left' })).toContainText(
    money('490 000 Ft'),
  );
  const card = page.locator('[data-slot=card]').filter({
    has: page.getByRole('heading', { name: 'Savings' }),
  });
  await expect(card.getByRole('link', { name: 'Surprise for Ben' })).toBeVisible();
  // Saving is no debt: the two are still square.
  await expect(page.getByRole('region', { name: 'Balance' })).toContainText("You're all square");

  // Taking money out gives it back to the month, and never more than the goal holds.
  await card.getByRole('link', { name: 'All goals' }).click();
  await page.getByRole('link', { name: 'Summer in Italy', exact: true }).click();
  const takeOut = page.getByRole('dialog', { name: 'Summer in Italy' });
  await takeOut.getByRole('button', { name: 'Take out' }).first().click();
  await field(takeOut, 'Amount').fill('900000');
  await takeOut.getByRole('button', { name: 'Take out' }).last().click();
  await expect(takeOut.getByText(money('The goal holds only 250 000 Ft'))).toBeVisible();
  await field(takeOut, 'Amount').fill('60000');
  await takeOut.getByRole('button', { name: 'Take out' }).last().click();
  await expect(page.getByText('Taken out of Summer in Italy')).toBeVisible();

  await openOverview(page, householdId);
  await expect(left.getByRole('listitem').filter({ hasText: 'Set aside' })).toContainText(
    money('100 000 Ft'),
  );
  await expect(left.getByRole('listitem').filter({ hasText: 'Left' })).toContainText(
    money('550 000 Ft'),
  );

  await partnerContext.close();
});
