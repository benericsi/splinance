import { expect, test } from '@playwright/test';
import { createHousehold, newUser, register } from '../support/app';

// The only suite with a service worker: the others block it (playwright.config.ts).
test.use({ serviceWorkers: 'allow' });

test('the app can be installed: the manifest is linked and its icons load', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await request.get(href ?? '');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({ name: 'Splinance', display: 'standalone', start_url: '/' });
  expect(manifest.icons.map((icon) => icon.purpose)).toContain('maskable');
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.headers()['content-type']).toBe('image/png');
  }
});

test('without a connection the app still opens and says so, then recovers', async ({
  page,
  context,
}) => {
  await register(page, newUser('Anna'));
  const { householdId } = await createHousehold(page, 'Home');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.goto(`/h/${householdId}`);
  // Served by the worker; the session cannot be checked, which is not the same as signed out.
  await expect(page.getByRole('heading', { name: 'No connection' })).toBeVisible();
  await expect(page).toHaveURL(`/h/${householdId}`);

  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeAttached();
  await expect(page).toHaveURL(`/h/${householdId}`);
});

test('the worker never answers for the API: no data is cached', async ({ page, context }) => {
  await register(page, newUser('Anna'));
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.filter((path) => path.startsWith('/api'))).toEqual([]);

  await context.setOffline(true);
  const status = await page.evaluate(async () => {
    try {
      return (await fetch('/api/me')).status;
    } catch {
      return 'no answer';
    }
  });
  expect(status).toBe('no answer');
});
