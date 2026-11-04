import { expect, type Page, test } from '@playwright/test';
import { createHousehold, field, logout, newUser, register } from '../support/app';
import { FAKE_OIDC_ISSUER } from '../support/env';

/**
 * "Continue with Google" against the fake provider on 127.0.0.1 (another site than the app
 * on localhost, so the browser treats the round trip as cross-site, like with Google): its
 * "Sign in as" form stands in for Google's account chooser.
 */
async function continueWithGoogle(
  page: Page,
  person: { email: string; name?: string },
  { verified = true, cancel = false }: { verified?: boolean; cancel?: boolean } = {},
) {
  await page.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(new RegExp(`^${FAKE_OIDC_ISSUER}/authorize`));
  if (cancel) {
    await page.getByRole('button', { name: 'Cancel' }).click();
    return;
  }
  await page.getByLabel('Email', { exact: true }).fill(person.email);
  if (person.name) await page.getByLabel('Name', { exact: true }).fill(person.name);
  if (!verified) await page.getByLabel('Email verified').uncheck();
  await page.getByRole('button', { name: 'Approve' }).click();
}

function googlePerson(name: string) {
  const { email } = newUser(name);
  return { email, name };
}

test('signs up with Google, keeps the session on reload and signs in again', async ({ page }) => {
  const gabi = googlePerson('Gabi');
  await page.goto('/login');
  await continueWithGoogle(page, gabi);

  await expect(page).toHaveURL('/welcome');
  await expect(page.getByRole('heading', { name: 'Welcome, Gabi' })).toBeVisible();
  // The refresh cookie set on the cross-site callback is what restores the session.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Gabi' })).toBeVisible();

  await logout(page);
  await continueWithGoogle(page, gabi);
  await expect(page.getByRole('heading', { name: 'Welcome, Gabi' })).toBeVisible();
});

test('explains a cancelled sign-in and an unverified email', async ({ page }) => {
  await page.goto('/login');
  await continueWithGoogle(page, googlePerson('Hedi'), { cancel: true });
  await expect(page.getByRole('alert')).toHaveText('Google sign-in was cancelled.');
  // The code leaves the address bar once shown.
  await expect(page).toHaveURL('/login');

  await continueWithGoogle(page, googlePerson('Hedi'), { verified: false });
  await expect(page.getByRole('alert')).toContainText("Your Google account's email isn't verified");
});

test('connects Google to an existing password account only after its password', async ({
  page,
}) => {
  const cecil = newUser('Cecil');
  await register(page, cecil);
  await logout(page);

  await continueWithGoogle(page, { email: cecil.email, name: 'Cecil G' });
  await expect(page).toHaveURL('/login?oauth=link');
  await expect(page.getByText('Connect your Google account')).toBeVisible();
  await expect(field(page, 'Email')).toHaveValue(cecil.email);

  await field(page, 'Password').fill(cecil.password);
  await page.getByRole('button', { name: 'Log in and connect' }).click();
  await expect(page).toHaveURL('/welcome');
  await expect(
    page.getByText('Google is now connected. Next time, continue with Google.'),
  ).toBeVisible();
  // The account keeps its own name; Google's is not copied over.
  await expect(page.getByRole('heading', { name: 'Welcome, Cecil' })).toBeVisible();

  await logout(page);
  await continueWithGoogle(page, { email: cecil.email });
  await expect(page).toHaveURL('/welcome');
});

test('a partner signs up with Google from an invite link and joins', async ({ page, browser }) => {
  await register(page, newUser('Anna'));
  const { householdId, inviteLink } = await createHousehold(page, 'Home', { invite: true });

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto(inviteLink);
  await partner.getByRole('link', { name: 'Create an account' }).click();
  await continueWithGoogle(partner, googlePerson('Ben'));

  // Back on the invite page: the destination survived the round trip, the token stayed in
  // sessionStorage.
  await expect(partner).toHaveURL('/invite');
  await partner.getByRole('button', { name: 'Join Home' }).click();
  await expect(partner).toHaveURL(`/h/${householdId}`);
  await expect(partner.getByText('Welcome to Home')).toBeVisible();

  await partnerContext.close();
});
