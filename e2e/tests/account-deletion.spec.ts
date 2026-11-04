import { expect, test } from '@playwright/test';
import {
  addTransaction,
  createHousehold,
  field,
  newUser,
  openOverview,
  openTransactions,
  recordPayment,
  register,
  submitLogin,
  submitRegister,
} from '../support/app';

test('a partner deletes their account once settled; the shared history stays', async ({
  page,
  browser,
}) => {
  // Anna owns Home; Ben joins as a member (his credentials are needed to delete).
  await register(page, newUser('Anna'));
  const { householdId, inviteLink } = await createHousehold(page, 'Home', { invite: true });
  const benContext = await browser.newContext();
  const ben = await benContext.newPage();
  const benUser = newUser('Ben');
  await ben.goto(inviteLink);
  await ben.getByRole('link', { name: 'Create an account' }).click();
  await submitRegister(ben, benUser);
  await ben.getByRole('button', { name: 'Join Home' }).click();
  await expect(ben).toHaveURL(`/h/${householdId}`);

  await openTransactions(page, householdId);
  await addTransaction(page, { amount: '10000', description: 'Groceries' });

  // Ben owes Anna: deleting is blocked, the dialog leads to settling up.
  await ben.goto('/account/delete');
  const blocked = ben.getByRole('dialog', { name: 'Delete your account?' });
  await expect(blocked).toContainText('Home: an open balance.');
  await expect(blocked.getByRole('button', { name: 'Delete my account' })).toHaveCount(0);
  await blocked.getByRole('link', { name: 'Settle up' }).click();
  await expect(ben).toHaveURL(`/h/${householdId}`);
  await recordPayment(ben);

  await ben.goto('/account');
  await ben.getByRole('link', { name: 'Delete account…' }).click();
  const dialog = ben.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toContainText(
    'You leave Home. Your shared entries stay there as Former member.',
  );
  await field(dialog, 'Current password').fill(benUser.password);
  await field(dialog, `Type ${benUser.email} to confirm`).fill(benUser.email);
  await dialog.getByRole('button', { name: 'Delete my account' }).click();

  await expect(ben).toHaveURL('/login');
  await expect(
    ben.getByText('Your account has been deleted. Thanks for using Splinance.'),
  ).toBeVisible();
  await submitLogin(ben, benUser);
  await expect(ben.getByText('Invalid email or password')).toBeVisible();
  await benContext.close();

  // Anna keeps the expense and the payment, from a "Former member", and owes nothing.
  await openOverview(page, householdId);
  await expect(page.getByText('Former member').first()).toBeVisible();
  await expect(page.getByText('Ben', { exact: true })).toHaveCount(0);
});
