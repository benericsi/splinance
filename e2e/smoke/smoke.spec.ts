import { expect, type Page, test } from '@playwright/test';
import { field } from '../support/app';

/**
 * The production images behind the real Caddyfile: what only a deployed stack can show. A
 * CSP that blocks the theme script, a missing header or a proxy that loses /api would pass
 * every other suite (they run `vite preview`) and break production.
 */

const DEMO_URL = process.env.SMOKE_DEMO_URL ?? 'http://demo.localhost:8080';

/** Collects CSP violations from the first script on; the browser reports them as events. */
async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __cspViolations: seen });
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return async () => [
    ...consoleErrors,
    ...(await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    )),
  ];
}

test('production: headers, CSP and the allowlist hold behind Caddy', async ({ page }) => {
  const violations = await watchCsp(page);
  const response = await page.goto('/login');
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("script-src 'self' 'sha256-");
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['cache-control']).toBe('no-cache');
  expect(headers.server).toBeUndefined();

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The theme script ran (allowed by its hash): it always sets a color scheme.
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toMatch(
    /^(light|dark)$/,
  );
  await expect(page.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', DEMO_URL);

  // /api reaches the production API, which only lets allowlisted emails sign up.
  await page.goto('/register');
  await field(page, 'Display name').fill('Visitor');
  await field(page, 'Email').fill('visitor@example.com');
  await field(page, 'Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Sign-ups are invite-only for now')).toBeVisible();

  expect(await violations()).toEqual([]);
});

test('production: hashed assets are cached for good, the API keeps its own headers', async ({
  request,
}) => {
  const html = await (await request.get('/login')).text();
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!asset) throw new Error('No script asset in index.html');
  const assetResponse = await request.get(asset);
  expect(assetResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

  const api = await request.get('/api/health/ready');
  expect(api.status()).toBe(200);
  // Helmet's CSP on API responses, not the web one.
  expect(api.headers()['content-security-policy']).not.toContain('sha256-');
  // Production has no demo routes.
  expect((await request.post('/api/demo')).status()).toBe(404);
});

test('demo: a visitor tries the demo through Caddy without CSP violations', async ({ page }) => {
  const violations = await watchCsp(page);
  await page.goto(DEMO_URL);
  await expect(
    page.getByRole('heading', { name: 'Shared expenses, sorted.', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page).toHaveURL(/\/h\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeAttached();

  expect(await violations()).toEqual([]);
});
