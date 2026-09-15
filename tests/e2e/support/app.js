/**
 * Shared boot helpers for the e2e specs.
 *
 * Every spec opens a dashboard and waits for its sidebar before touching anything —
 * the app rejects interaction while it is still transitioning into its default view.
 * One timeout for all of them.
 */

import { expect } from './test.js';

/** How long a dashboard may take to boot, in ms. */
export const LOAD_TIMEOUT = 20_000;

/** The collapsed rail's width — `--sidebar-rail-width` in src/styles/foundation/variables.css. */
const SIDEBAR_RAIL_WIDTH = 60;

/**
 * Open a dashboard and wait until its sidebar is rendered.
 * @param {import('playwright').Page} page - The test page.
 * @param {string} path - App path with optional query, e.g. `/en/` or `/sl/?scope=schools/sl`.
 */
export async function gotoApp(page, path) {
    await page.goto(path, { timeout: LOAD_TIMEOUT });
    await page.waitForSelector('.sidebar-nav-button', { timeout: LOAD_TIMEOUT });
}

/**
 * Click a sidebar nav button, then take the pointer off the rail and wait for it to
 * collapse.
 *
 * Playwright leaves the mouse where it clicked, so the rail stays `:hover`-expanded
 * (250px, sidebarModule.css) over the header. At the suite's 1280px viewport the header
 * is in its narrow tier (header-module.css), whose control row starts at the left edge —
 * under the expanded rail. A following click on the first header control fails the
 * hit-target check, which Playwright runs *before* it moves the mouse, so the rail never
 * collapses and every retry meets the same interceptor. A human moves the pointer away;
 * this does the same.
 * @param {import('playwright').Page} page - The test page.
 * @param {string} selector - The nav button, e.g. `#itemViewButton`.
 */
export async function clickNav(page, selector) {
    await page.locator(selector).click();
    // Into the content area, clear of the rail's expanded width and of the header.
    await page.mouse.move(640, 400);
    await expect
        .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width))
        .toBeLessThanOrEqual(SIDEBAR_RAIL_WIDTH);
}
