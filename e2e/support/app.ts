import { randomUUID } from 'node:crypto';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

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
export function field(page: Page | Locator, label: string) {
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
  // The URL changes before the overview's loaders finish; until then the onboarding page
  // (with its own account menu) is still on screen.
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeAttached();
  const householdId = new URL(page.url()).pathname.split('/')[2] ?? '';
  return { householdId, inviteLink };
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
}

/**
 * Anna creates "Home" on `page`, Ben joins it from an invite link in his own browser
 * context. Both end on the household overview. The caller closes `partnerContext`.
 */
export async function householdWithPartner(
  page: Page,
  browser: Browser,
): Promise<{ householdId: string; partner: Page; partnerContext: BrowserContext }> {
  await register(page, newUser('Anna'));
  const { householdId, inviteLink } = await createHousehold(page, 'Home', { invite: true });

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto(inviteLink);
  await partner.getByRole('link', { name: 'Create an account' }).click();
  await submitRegister(partner, newUser('Ben'));
  await partner.getByRole('button', { name: 'Join Home' }).click();
  await expect(partner).toHaveURL(`/h/${householdId}`);

  return { householdId, partner, partnerContext };
}

export interface NewTransaction {
  /** As typed, e.g. '10001'. */
  amount: string;
  description: string;
  /** "Just me" instead of the default shared, equal split. */
  private?: boolean;
  /** Percent per person, by the name the split editor shows ('You', 'Ben'). */
  percentages?: Record<string, string>;
}

/** The household's transactions page for the current month. */
export async function openTransactions(page: Page, householdId: string) {
  await page.goto(`/h/${householdId}/transactions`);
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
}

/** Adds a transaction from the transactions page (desktop header button). */
export async function addTransaction(page: Page, transaction: NewTransaction) {
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await fillTransaction(page, transaction);
}

/** Fills the open "Add transaction" dialog, saves it and waits for it to close. */
export async function fillTransaction(page: Page, transaction: NewTransaction) {
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await field(dialog, 'Amount').fill(transaction.amount);
  await field(dialog, 'Description').fill(transaction.description);

  if (transaction.private) {
    await dialog.getByRole('button', { name: 'Just me' }).click();
  }
  if (transaction.percentages) {
    await dialog.getByRole('button', { name: 'Change' }).click();
    await dialog.getByRole('button', { name: 'Percent' }).click();
    for (const [person, percent] of Object.entries(transaction.percentages)) {
      await dialog.getByRole('textbox', { name: `Percent for ${person}` }).fill(percent);
    }
  }

  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  // The toast of an earlier add may still be on screen.
  await expect(page.getByText('Transaction added').last()).toBeVisible();
}

/** A row of the transactions list (a link to its edit dialog), by its description. */
export function transactionRow(page: Page, description: string) {
  return page.getByRole('link').filter({ hasText: description });
}

/** A month total above the list: 'Spent', 'Your share' or 'Income'. */
export function monthStat(page: Page, label: 'Spent' | 'Your share' | 'Income') {
  return page.locator(`dt:text-is("${label}") + dd`);
}

/**
 * An amount as the app formats it (Hungarian conventions): '10 001 Ft' with a no-break
 * space between groups, so tests match any whitespace.
 */
export function money(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s');
  return new RegExp(escaped);
}
