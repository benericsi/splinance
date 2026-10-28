import { expect, type Page } from '@playwright/test';

/**
 * From the landing page: "Try the demo", then wait for the seeded household's overview.
 * Seeding takes a second or two. Returns the household id.
 */
export async function tryDemo(page: Page): Promise<string> {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Shared expenses, sorted.', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page).toHaveURL(/\/h\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeAttached();
  return new URL(page.url()).pathname.split('/')[2] ?? '';
}

/** The demo strip above household pages. */
export function banner(page: Page) {
  return page.getByRole('complementary', { name: 'Demo' });
}
