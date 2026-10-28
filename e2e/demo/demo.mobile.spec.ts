import { expect, type Page, test } from '@playwright/test';
import { banner, tryDemo } from './demo-app';

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the landing page and the demo fit a phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  expect(await overflow(page)).toBe(0);

  await tryDemo(page);
  await expect(banner(page)).toBeVisible();
  await expect(banner(page).getByRole('button', { name: 'Start over' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Household sections' })).toBeVisible();
  expect(await overflow(page)).toBe(0);
});
