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

  // The month by day: pointing at a day shows what it spent and set aside, then the salary day.
  const bars = page.getByTestId('day-bars');
  for (const day of [
    bars.locator('[data-part="set-aside"]').first(),
    bars.locator('[data-mark="income"]').first(),
  ]) {
    const box = await day.boundingBox();
    if (!box) throw new Error('No day to point at');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
    await expect(bars.getByTestId('day-bar-label')).toBeVisible();
    await pause(page, 2200);
  }
  await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2, { steps: 20 });
  await pause(page, 600);

  const sections = page.getByRole('navigation', { name: 'Household sections' }).first();
  await glideAndClick(page, sections.getByRole('link', { name: 'Transactions' }));
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
  await pause(page, 1500);
  await page.mouse.wheel(0, 500);
  await pause(page, 1500);

  // The calendar: the month by day, then the latest day with spending and its rows.
  await glideAndClick(page, sections.getByRole('link', { name: 'Calendar' }));
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await pause(page, 2500);
  await glideAndClick(
    page,
    page
      .getByRole('list', { name: /^Days of / })
      .getByRole('link', { name: /, spent / })
      .last(),
  );
  await expect(page.getByRole('dialog')).toBeVisible();
  await pause(page, 2500);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await pause(page, 800);

  // Recurring payments: confirmed and hand-added ones, one gone quiet, suggestions below.
  await glideAndClick(page, sections.getByRole('link', { name: 'Recurring' }));
  await expect(page.getByRole('heading', { name: 'Recurring', level: 1 })).toBeVisible();
  await pause(page, 2000);
  await page.mouse.wheel(0, 500);
  await pause(page, 1500);
  await page.mouse.wheel(0, -500);
  await pause(page, 500);

  await glideAndClick(page, sections.getByRole('link', { name: 'Reports' }));
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
  await pause(page, 2500);

  await glideAndClick(page, sections.getByRole('link', { name: 'Budgets' }));
  await expect(page.getByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();
  await pause(page, 2000);

  // Savings: the pinned goals with their milestones, then one goal with its history.
  await glideAndClick(page, sections.getByRole('link', { name: 'Savings' }));
  await expect(page.getByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();
  await pause(page, 3000);
  await glideAndClick(page, page.getByRole('link', { name: 'Add money' }).first());
  await expect(page.getByRole('dialog', { name: 'Summer in Italy' })).toBeVisible();
  await pause(page, 3000);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await pause(page, 800);

  await glideAndClick(page, sections.getByRole('link', { name: 'Overview' }));
  await expect(page.getByRole('heading', { name: 'Balance' })).toBeVisible();
  await pause(page, 1500);

  // The same overview as a map; dropping yourself on your partner opens settle up.
  await glideAndClick(
    page,
    page.getByRole('group', { name: 'Overview layout' }).getByRole('button', { name: 'Map' }),
  );
  const map = page.getByRole('region', { name: 'Household map' });
  const nodes = map.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible();
  await pause(page, 3000);
  const from = await nodes.filter({ hasText: '(you)' }).boundingBox();
  const to = await nodes.filter({ hasText: 'Jane Doe' }).boundingBox();
  if (!from || !to) throw new Error('No people on the map');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2, { steps: 30 });
  await pause(page, 250);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 40 });
  await pause(page, 600);
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Settle up' })).toBeVisible();
  await pause(page, 2500);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await pause(page, 1200);

  // The bell: the partner's week, a renewal and a budget alert.
  await glideAndClick(page, page.getByRole('button', { name: /^Notifications/ }));
  await expect(page.getByRole('list', { name: 'Notifications' })).toBeVisible();
  await pause(page, 3000);
  await page.keyboard.press('Escape');
  await pause(page, 1000);

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
