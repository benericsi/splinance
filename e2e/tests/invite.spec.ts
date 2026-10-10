import { expect, test } from '@playwright/test';
import { createHousehold, field, newUser, register, submitRegister } from '../support/app';

test('an owner invites a partner who signs up from the link and joins', async ({
  page,
  browser,
}) => {
  await register(page, newUser('Anna'));
  await expect(page.getByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
  const { householdId, inviteLink } = await createHousehold(page, 'Home', { invite: true });

  // The partner opens the link on their own device: a separate, logged-out browser context.
  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto(inviteLink);
  await expect(partner.getByRole('heading', { name: 'Join Home' })).toBeVisible();
  // The token leaves the address bar once it is stashed in sessionStorage.
  await expect(partner).toHaveURL('/invite');

  await partner.getByRole('link', { name: 'Create an account' }).click();
  await submitRegister(partner, newUser('Ben'));

  // Back on the invite page after registering, with the token from sessionStorage.
  await expect(partner).toHaveURL('/invite');
  await partner.getByRole('button', { name: 'Join Home' }).click();
  await expect(partner).toHaveURL(`/h/${householdId}`);
  await expect(partner.getByText('Welcome to Home')).toBeVisible();
  await expect(partner.getByRole('heading', { level: 1 })).toContainText('Ben');

  // The owner sees the new member after a reload.
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ben' })).toBeVisible();

  // Each link works once.
  await partner.goto(inviteLink);
  await expect(
    partner.getByRole('heading', { name: 'This invite was already used' }),
  ).toBeVisible();

  await partnerContext.close();
});

test('a registered user joins by pasting the link during onboarding', async ({ page, browser }) => {
  await register(page, newUser('Anna'));
  const { householdId, inviteLink } = await createHousehold(page, 'Flatmates', { invite: true });

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await register(partner, newUser('Ben'));
  await partner.getByRole('link', { name: /Join with an invite link/ }).click();

  await field(partner, 'Invite link').fill('not a link');
  await partner.getByRole('button', { name: 'Continue' }).click();
  await expect(partner.getByText("That doesn't look like an invite link")).toBeVisible();

  await field(partner, 'Invite link').fill(inviteLink);
  await partner.getByRole('button', { name: 'Continue' }).click();
  await expect(partner.getByRole('heading', { name: 'Join Flatmates' })).toBeVisible();
  await partner.getByRole('button', { name: 'Join Flatmates' }).click();
  await expect(partner).toHaveURL(`/h/${householdId}`);

  await partnerContext.close();
});

test('a revoked invite link no longer works', async ({ page, browser }) => {
  await register(page, newUser('Anna'));
  const { householdId, inviteLink } = await createHousehold(page, 'Home', { invite: true });

  await page.goto(`/h/${householdId}/settings/invite`);
  const dialog = page.getByRole('dialog', { name: 'Invite to Home' });
  await dialog.getByRole('button', { name: /^Revoke invite by Anna/ }).click();
  await expect(page.getByText('Invite revoked')).toBeVisible();
  await expect(dialog.getByText('No pending invites.')).toBeVisible();

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto(inviteLink);
  await expect(partner.getByRole('heading', { name: 'This invite was revoked' })).toBeVisible();
  await partnerContext.close();
});

test('an incomplete invite link explains itself', async ({ page }) => {
  await page.goto('/invite');
  await expect(page.getByRole('heading', { name: 'This invite link is incomplete' })).toBeVisible();
});
