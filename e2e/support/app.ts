import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export interface TestUser {
  displayName: string;
  email: string;
  password: string;
}

/** A fresh user per test: unique email, a password that passes every required rule. */
export function newUser(displayName: string): TestUser {
  const id = randomUUID().slice(0, 8);
  return {
    displayName,
    email: `${displayName.toLowerCase()}-${id}@example.com`,
    password: `tidal-pencil-orbit-${id}`,
  };
}

/**
 * A form input by its visible label. Labels of required fields end in an aria-hidden
 * asterisk, and an exact match keeps "Password" from also matching "Show password".
 */
export function field(page: Page, label: string) {
  return page.getByLabel(new RegExp(`^${label}\\*?$`));
}

/** Fills the register form on the current page and submits it. */
export async function submitRegister(page: Page, user: TestUser) {
  await field(page, 'Display name').fill(user.displayName);
  await field(page, 'Email').fill(user.email);
  await field(page, 'Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** Fills the login form on the current page and submits it. */
export async function submitLogin(page: Page, user: Pick<TestUser, 'email' | 'password'>) {
  await field(page, 'Email').fill(user.email);
  await field(page, 'Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Registers from /register; a new account lands on onboarding. */
export async function register(page: Page, user: TestUser) {
  await page.goto('/register');
  await submitRegister(page, user);
  await expect(page).toHaveURL('/welcome');
}

/**
 * Onboarding from /welcome: creates the household and, optionally, an invite link.
 * Ends on the household overview and returns its id and the raw invite link ('' if none).
 */
export async function createHousehold(
  page: Page,
  name: string,
  { invite = false }: { invite?: boolean } = {},
): Promise<{ householdId: string; inviteLink: string }> {
  await page.getByRole('link', { name: /Create a household/ }).click();
  await field(page, 'Name').fill(name);
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByRole('heading', { name: 'Invite your partner' })).toBeVisible();

  let inviteLink = '';
  if (invite) {
    await page.getByRole('button', { name: 'Create invite link' }).click();
    inviteLink = await page.getByRole('textbox', { name: 'Invite link' }).inputValue();
    await page.getByRole('link', { name: 'Continue' }).click();
  } else {
    await page.getByRole('link', { name: 'Skip for now' }).click();
  }

  await expect(page.getByRole('heading', { name: `${name} is ready` })).toBeVisible();
  await page.getByRole('link', { name: `Go to ${name}` }).click();
  await expect(page).toHaveURL(/\/h\/[^/]+$/);
  const householdId = new URL(page.url()).pathname.split('/')[2] ?? '';
  return { householdId, inviteLink };
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
}
