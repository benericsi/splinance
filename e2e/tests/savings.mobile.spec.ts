import { expect, test } from '@playwright/test';
import { createHousehold, field, money, newUser, register } from '../support/app';

test('savings is reached from Budgets on a phone, and a goal opens as a drawer', async ({
  page,
}) => {
  await register(page, newUser('Anna'));
  await createHousehold(page, 'Home');

  // No seventh tab: Budgets holds a switch to savings and stays the highlighted tab.
  const tabs = page.getByRole('navigation', { name: 'Household sections' });
  await tabs.getByRole('link', { name: 'Budgets' }).click();
  const viewSwitch = page.getByRole('navigation', { name: 'Budgets or savings' });
  await viewSwitch.getByRole('link', { name: 'Savings' }).click();
  await expect(page.getByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Budgets' })).toHaveAttribute('aria-current', 'page');
  await expect(viewSwitch.getByRole('link', { name: 'Savings' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('link', { name: 'Create a goal' }).click();
  const form = page.getByRole('dialog', { name: 'New goal' });
  await field(form, 'Name').fill('New laptop');
  await field(form, 'Target').fill('450000');
  await form.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByText('Goal created')).toBeVisible();

  // The goal opens over the page; the back button closes it.
  await page.getByRole('link', { name: 'Add money' }).click();
  const goal = page.getByRole('dialog', { name: 'New laptop' });
  await field(goal, 'Amount').fill('120000');
  await goal.getByRole('button', { name: 'Add money' }).click();
  await expect(page.getByText('Added to New laptop')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText(money('105 000 Ft to 50%'))).toBeVisible();

  // Nothing overflows sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
