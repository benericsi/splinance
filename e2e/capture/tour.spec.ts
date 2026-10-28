import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { tryDemo } from '../demo/demo-app';

/** Where the landing page imports its media from. */
const OUT = fileURLToPath(new URL('../../apps/web/src/assets/demo/', import.meta.url));
const VIDEO_DIR = fileURLToPath(new URL('../test-results/capture/video/', import.meta.url));
const DESKTOP = { width: 1280, height: 800 };
const SCHEMES = ['light', 'dark'] as const;

/**
 * Playwright's videos show no mouse pointer. This draws one (a dot that follows mouse moves
 * and pulses on clicks), so the tour shows where it clicks.
 */
const POINTER = () => {
  const dot = document.createElement('div');
  dot.id = 'tour-pointer';
  dot.setAttribute('aria-hidden', 'true');
  Object.assign(dot.style, {
    position: 'fixed',
    left: '640px',
    top: '400px',
    width: '22px',
    height: '22px',
    margin: '-11px 0 0 -11px',
    borderRadius: '50%',
    background: 'rgba(20, 20, 20, 0.35)',
    border: '2px solid #fff',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'transform 120ms ease-out',
  });
  window.addEventListener('mousemove', (event) => {
    dot.style.left = `${String(event.clientX)}px`;
    dot.style.top = `${String(event.clientY)}px`;
  });
  window.addEventListener('mousedown', () => {
    dot.style.transform = 'scale(0.7)';
  });
  window.addEventListener('mouseup', () => {
    dot.style.transform = 'scale(1)';
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(dot);
    // The landing page's own tour would show this recording inside itself.
    const style = document.createElement('style');
    style.textContent = 'section[aria-label="A tour of the app"] { display: none !important; }';
    document.head.append(style);
  });
};

/** Glides the pointer to the middle of `target`, then clicks: what a person would do. */
async function glideAndClick(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Nothing to click');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.up();
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function recordTour(browser: Browser, scheme: (typeof SCHEMES)[number]) {
  const context = await browser.newContext({
    viewport: DESKTOP,
    colorScheme: scheme,
    recordVideo: { dir: VIDEO_DIR, size: DESKTOP },
  });
  await context.addInitScript(POINTER);
  const page = await context.newPage();
  const video = page.video();

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  await pause(page, 1200);
  await glideAndClick(page, page.getByRole('button', { name: 'Try the demo' }));
  await expect(page).toHaveURL(/\/h\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeVisible();
  await pause(page, 1500);
  // The poster: what the video shows before it plays, and instead of it with reduced motion.
  await page.screenshot({
    path: `${OUT}overview-${scheme}.jpg`,
    type: 'jpeg',
    quality: 80,
    style: '#tour-pointer { display: none }',
  });
  await pause(page, 1000);

  const sections = page.getByRole('navigation', { name: 'Household sections' }).first();
  await glideAndClick(page, sections.getByRole('link', { name: 'Transactions' }));
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
  await pause(page, 1500);
  await page.mouse.wheel(0, 500);
  await pause(page, 1500);

  await glideAndClick(page, sections.getByRole('link', { name: 'Reports' }));
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
  await pause(page, 2500);

  await glideAndClick(page, sections.getByRole('link', { name: 'Budgets' }));
  await expect(page.getByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();
  await pause(page, 2000);

  await glideAndClick(page, sections.getByRole('link', { name: 'Overview' }));
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeVisible();
  await pause(page, 1500);

  await context.close();
  await video?.saveAs(`${OUT}tour-${scheme}.webm`);
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const scheme of SCHEMES) {
  test(`tour of the demo on a desktop (${scheme})`, async ({ browser }) => {
    await recordTour(browser, scheme);
  });

  test(`the demo overview on a phone (${scheme})`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });
    const page = await context.newPage();
    await tryDemo(page);
    await expect(page.getByRole('heading', { name: 'Balance' })).toBeVisible();
    await pause(page, 1000);
    await page.screenshot({ path: `${OUT}phone-${scheme}.jpg`, type: 'jpeg', quality: 80 });
    await context.close();
  });
}
