/**
 * Touch navigation: getting a page to a surface that only exists after an interaction.
 *
 * Shared by touch-smoke.spec.js and accessibility-surfaces.spec.js. Everything here taps
 * rather than clicks — a Playwright `.click()` hovers first, which on a hover-gated
 * affordance quietly does the very thing a touch test is trying to prove impossible.
 * They need a context with `test.override('touchDevice', true)`. The export cart's verbs
 * come from ./cart.js, built with `touch: true` for the same reason.
 */

import { expect } from './test.js';
import { gotoApp, LOAD_TIMEOUT } from './app.js';
import { cardOf, exportCart } from './cart.js';

/**
 * Load a dashboard — EN unless told otherwise, which is what most of the touch
 * surfaces below live on. `gotoApp` already waits for the sidebar, which is the
 * point at which the app accepts a view switch.
 * @param {import('playwright').Page} page - The page.
 * @param {string} [path] - Dashboard path.
 */
export async function openDashboard(page, path = '/en/') {
    await gotoApp(page, path);
}

/**
 * Expand the collapsed sidebar rail the way a finger does. `:hover` is gated behind
 * `@media (hover: hover)`, so on touch `.is-expanded` is the only thing that reveals the
 * nav labels, the page's only `<h1>` and the settings section.
 * @param {import('playwright').Page} page - The page.
 */
export async function expandSidebar(page) {
    await page.locator('.sidebar-header').tap();
    await expect(page.locator('.sidebar')).toHaveClass(/\bis-expanded\b/);
}

/**
 * Open the notes drawer.
 * @param {import('playwright').Page} page - The page.
 */
export async function openNotes(page) {
    await page.locator('[data-header-action-button="notes-toggle"]').tap();
    await page.waitForSelector('.notes-drawer.visible', { timeout: LOAD_TIMEOUT });
}

/**
 * Open the EN class view's student-search modal — the only host that enables the
 * scatterplot's selection mode, and the home of the touch arming toggle.
 * @param {import('playwright').Page} page - The page.
 */
export async function openScatterplotFilter(page) {
    await page.locator('#classViewButton').tap();
    await page.locator('[data-header-action-button="scatter-search"]').tap({
        timeout: LOAD_TIMEOUT,
    });
    await page
        .locator('.scatterplot-filter-chart svg')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

/**
 * Get to the EN report view with two cards in it: one chart from the item view, one from
 * the overview. Starts from an empty cart, so the caller gets the same two cards every time.
 * @param {import('playwright').Page} page - The page.
 */
export async function openReportWithTwoCards(page) {
    const cart = exportCart(page, { touch: true });
    await openDashboard(page);
    await cart.empty();

    await page.locator('#itemViewButton').tap();
    await page
        .locator('#item-itemLollipop svg')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await cart.tick(cardOf(page.locator('#item-itemLollipop')));

    await page.locator('#overviewViewButton').tap();
    const overviewSvg = page.locator('#en-overview-container svg').first();
    await overviewSvg.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await cart.tick(cardOf(overviewSvg));

    await cart.toReport();
    await expect(page.locator('.report-card')).toHaveCount(2);
}
