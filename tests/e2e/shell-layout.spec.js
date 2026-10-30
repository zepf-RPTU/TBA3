/**
 * E2E tests: what the shell's layout leaves reachable.
 *
 * The export toolbar is the shell's last flex item, so the views above give it its room
 * instead of passing under it; the view title breaks between words, never inside one;
 * the chooser, which has no shell floor, reflows to a phone's width; the chooser and the
 * dashboard sidebar each link the Impressum (the e2e build has no wiki to open).
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { exportCart } from './support/cart.js';

test.describe('shell layout', () => {
    test('the export toolbar covers no card of the view above it', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await gotoApp(page, '/en/#overview');
        await exportCart(page).tickOverviewChart();
        const toolbar = page.locator('.batch-export-toolbar');
        await expect(toolbar).toBeVisible();

        const overlap = await page.evaluate(() => {
            const bar = /** @type {Element} */ (document.querySelector('.batch-export-toolbar'));
            const top = bar.getBoundingClientRect().top;
            return [...document.querySelectorAll('.view-shell .module-container')]
                .map((card) => card.getBoundingClientRect())
                .filter((box) => box.height > 0)
                .map((box) => box.bottom - top)
                .filter((past) => past > 0.5);
        });
        expect(overlap).toEqual([]);
    });

    // The narrowest desktop width where the title fits on one line is the one at risk.
    test('the SL material title breaks no word at 1290 px', async ({ page }) => {
        await page.setViewportSize({ width: 1290, height: 900 });
        await gotoApp(page, '/sl/#material');
        const title = page.locator('.header-module-title');
        await expect(title).toBeVisible({ timeout: LOAD_TIMEOUT_MS });

        const brokenWords = await title.evaluate((h1) => {
            const text = /** @type {Text} */ (
                [...h1.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)
            );
            const broken = [];
            for (const match of (text.textContent ?? '').matchAll(/\S+/g)) {
                const range = document.createRange();
                range.setStart(text, match.index ?? 0);
                range.setEnd(text, (match.index ?? 0) + match[0].length);
                const lines = new Set([...range.getClientRects()].map((rect) => rect.top));
                if (lines.size > 1) broken.push(match[0]);
            }
            return broken;
        });
        expect(brokenWords).toEqual([]);
    });

    test('the chooser reflows to 320 px without a sideways scroll', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto('/');
        await expect(page.locator('a[href*="en/"]').first()).toBeVisible();

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test('the chooser and the sidebar each link the Impressum', async ({ page }) => {
        const imprint = 'a[href$="docs/docs/impressum.html"]';
        await page.goto('/');
        await expect(page.locator(`.chooser-docs ${imprint}`)).toBeVisible();

        await gotoApp(page, '/en/#overview');
        await expect(page.locator(`.sidebar-legal ${imprint}`)).toBeAttached();
    });
});
