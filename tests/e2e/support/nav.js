/**
 * Navigation to a surface that only exists after an interaction.
 *
 * `openView` uses the pointer; everything else taps by default, for the reason
 * `exportCart` in ./cart.js gives, and so needs a `TABLET` context (./test.js) unless called
 * with `touch: false`.
 */

import { expect } from './test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT_MS } from './app.js';
import { cardOf, exportCart } from './cart.js';

/**
 * Switch to a view through its sidebar nav button, with the pointer, and wait for its
 * content.
 * @param {import('@playwright/test').Page} page
 * @param {{ button: string, content: string }} view - The view's nav button and the
 *     wrapper its content renders into.
 */
export async function openView(page, view) {
    await clickNav(page, view.button);
    await expect(page.locator(view.content)).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

/**
 * Expand the collapsed sidebar rail the way a finger does. `:hover` is gated behind
 * `@media (hover: hover)`, so on touch `.is-expanded` is the only thing that reveals the
 * nav labels, the page's only `<h1>` and the settings section.
 * @param {import('@playwright/test').Page} page
 */
export async function expandSidebar(page) {
    await page.locator('.sidebar-header').tap();
    await expect(page.locator('.sidebar')).toHaveClass(/\bis-expanded\b/);
}

/**
 * Open one of the sidebar's settings menus.
 * @param {import('@playwright/test').Page} page
 * @param {'color-scheme'|'competence-level-theme'} setting
 * @param {{ touch?: boolean }} [options]
 * @returns {Promise<import('@playwright/test').Locator>} The open menu.
 */
export async function openSidebarSetting(page, setting, { touch = true } = {}) {
    const trigger = page.locator(`[data-header-action-button="${setting}"]`);
    await (touch
        ? trigger.tap({ timeout: LOAD_TIMEOUT_MS })
        : trigger.click({ timeout: LOAD_TIMEOUT_MS }));
    const menu = page.locator(`.sidebar-${setting}-menu:popover-open`);
    await expect(menu).toBeVisible();
    return menu;
}

/**
 * Pick one option of a sidebar settings menu.
 * @param {import('@playwright/test').Page} page
 * @param {'color-scheme'|'competence-level-theme'} setting
 * @param {string} id - The option's id (`dark`, `grayscale`, …).
 * @param {{ touch?: boolean }} [options]
 */
export async function pickSidebarSetting(page, setting, id, { touch = true } = {}) {
    const option = (await openSidebarSetting(page, setting, { touch })).locator(
        `[data-menu-item-id="${id}"]`,
    );
    await (touch ? option.tap() : option.click());
}

/**
 * Open the notes drawer.
 * @param {import('@playwright/test').Page} page
 * @param {{ touch?: boolean }} [options]
 */
export async function openNotes(page, { touch = true } = {}) {
    const toggle = page.locator('[data-header-action-button="notes-toggle"]');
    await (touch ? toggle.tap() : toggle.click());
    await page.waitForSelector('.notes-drawer:popover-open', { timeout: LOAD_TIMEOUT_MS });
}

/**
 * Open EN on its group view and there the student-search modal — the only host that
 * enables the scatterplot's selection mode, and the home of the touch arming toggle.
 * @param {import('@playwright/test').Page} page
 * @param {{ touch?: boolean }} [options]
 * @returns {Promise<import('@playwright/test').Locator>} The header button that opened it.
 */
export async function openScatterplotFilter(page, { touch = true } = {}) {
    await gotoApp(page, '/en/#group');
    const trigger = page.locator('[data-header-action-button="scatter-search"]');
    await (touch
        ? trigger.tap({ timeout: LOAD_TIMEOUT_MS })
        : trigger.click({ timeout: LOAD_TIMEOUT_MS }));
    await page
        .locator('.scatterplot-filter-chart svg.chart-root')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    return trigger;
}

/**
 * Get to the EN report view with two cards in it: one chart from the item view, one from
 * the overview.
 * @param {import('@playwright/test').Page} page
 * @param {{ touch?: boolean }} [options]
 */
export async function openReportWithTwoCards(page, { touch = true } = {}) {
    const cart = exportCart(page, { touch });
    await gotoApp(page, '/en/#item');
    await cart.tick(cardOf(page.locator('#item-itemLollipop')));

    // With the pointer, through clickNav: a raw click leaves the rail hover-expanded.
    if (touch) await page.locator('#overviewViewButton').tap();
    else await clickNav(page, '#overviewViewButton');
    await cart.tickOverviewChart();

    await cart.toReport();
    await expect(page.locator('.report-card')).toHaveCount(2);
}
