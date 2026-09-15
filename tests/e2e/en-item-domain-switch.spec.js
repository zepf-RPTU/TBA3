/**
 * E2E test: EN item view domain switch - lollipop chart sync bug
 *
 * Regression test for the bug where switching from domain0 → domain1 left the
 * lollipop chart displaying all items instead of only domain1 items.
 *
 * Root cause: EnItemTableModule._applyModeChange fired dataFiltered with ALL items
 * (after removeFilter) before firing with domain1 items (after addFilter).
 * ChartRenderer._render()'s isRendering guard blocked the second (correct) update.
 *
 * Fix: The intermediate dataFiltered/dataSorted events from removeFilter are
 * suppressed via withSuppressedTableEvents when a new domain filter follows immediately.
 *
 * Data baseline for class 8a_mid:
 *   Domain ho (Hörverstehen):  36 items → 36 lollipop circles
 *   Domain le (Leseverstehen): 43 items → 43 lollipop circles
 *   All domains combined:      79 items → 79 lollipop circles
 */

import { test, expect, describe } from './support/test.js';
import { clickNav, LOAD_TIMEOUT } from './support/app.js';

// Allow time for the full app to load, parse, and render
// Allow time for domain switch to propagate through event bus → table → chart
const SWITCH_TIMEOUT = 5_000;

// Expected item counts from data/en/8a_mid/items.json (class groups only)
const DOMAIN_HO_COUNT = 36;
const DOMAIN_LE_COUNT = 43;
const ALL_COUNT = DOMAIN_HO_COUNT + DOMAIN_LE_COUNT; // 79

describe('EN item view – domain switch syncs lollipop chart', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/en/', { timeout: LOAD_TIMEOUT });

        // Wait for the app to be ready: sidebar navigation buttons appear after init
        await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT });
    });

    test('the "all" mode gives every Teilaufgabe its minimum pitch and scrolls the host', async ({
        page,
    }) => {
        // WHY: 79 rotated tick labels in the card's width overlapped into a hatch. The
        // chart now grows to a minimum pitch per item and the host scrolls instead.
        await clickNav(page, '#itemViewButton');
        const host = page.locator('#item-itemLollipop');
        await host.locator('svg').waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        await expect(host.locator('.lollipop-circle')).toHaveCount(ALL_COUNT, {
            timeout: SWITCH_TIMEOUT,
        });

        await expect(host).toHaveClass(/item-lollipop--scroll/);
        const { scrollWidth, clientWidth, tabIndex } = await host.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            tabIndex: el.tabIndex,
        }));
        expect(scrollWidth).toBeGreaterThan(clientWidth);
        // A scrolling region is keyboard-reachable (axe: scrollable-region-focusable).
        expect(tabIndex).toBe(0);

        // A single domain fits the card again: no scroll, no scroll class.
        await page.locator('[data-mode-switch-button="true"][data-mode="ho"]').first().click();
        await expect(host.locator('.lollipop-circle')).toHaveCount(DOMAIN_HO_COUNT, {
            timeout: SWITCH_TIMEOUT,
        });
        await expect(host).not.toHaveClass(/item-lollipop--scroll/);
    });

    test('switching domain0 → domain1 shows only domain1 items in lollipop chart', async ({
        page,
    }) => {
        await clickNav(page, '#itemViewButton');

        // Wait for the item view to be rendered (lollipop chart and table visible)
        const chartContainer = page.locator('#item-itemLollipop svg');
        await chartContainer.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Verify initial "all" mode shows all items in the lollipop
        const allCircles = page.locator('#item-itemLollipop .lollipop-circle');
        await expect(allCircles).toHaveCount(ALL_COUNT, { timeout: SWITCH_TIMEOUT });

        // Switch to domain ho (Hörverstehen)
        const hoButton = page.locator('[data-mode-switch-button="true"][data-mode="ho"]').first();
        await hoButton.click();

        // Wait for lollipop to update to ho items
        await expect(allCircles).toHaveCount(DOMAIN_HO_COUNT, { timeout: SWITCH_TIMEOUT });

        // Now switch to domain le (Leseverstehen) — this is the bug scenario
        const leButton = page.locator('[data-mode-switch-button="true"][data-mode="le"]').first();
        await leButton.click();

        // The chart must show exactly domain le items — NOT all 79 items
        // This was the bug: chart would show 79 circles instead of 43
        await expect(allCircles).toHaveCount(DOMAIN_LE_COUNT, { timeout: SWITCH_TIMEOUT });
    });

    test('switching all → domain0 → all shows correct counts', async ({ page }) => {
        await clickNav(page, '#itemViewButton');

        const chartContainer = page.locator('#item-itemLollipop svg');
        await chartContainer.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const allCircles = page.locator('#item-itemLollipop .lollipop-circle');

        // Start: all mode
        await expect(allCircles).toHaveCount(ALL_COUNT, { timeout: SWITCH_TIMEOUT });

        // Switch to ho
        await page.locator('[data-mode-switch-button="true"][data-mode="ho"]').first().click();
        await expect(allCircles).toHaveCount(DOMAIN_HO_COUNT, { timeout: SWITCH_TIMEOUT });

        // Switch back to all
        await page.locator('[data-mode-switch-button="true"][data-mode="all"]').first().click();
        await expect(allCircles).toHaveCount(ALL_COUNT, { timeout: SWITCH_TIMEOUT });
    });
});
