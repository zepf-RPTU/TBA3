/**
 * Shared helpers for the SL Überblick specs.
 */

import { LOAD_TIMEOUT_MS } from './app.js';

/**
 * German number formatting separates the value from its unit with a non-breaking
 * space, so '78 %' never matches a plain-space literal.
 * @param {unknown} value
 * @returns {string} The text with every thin/non-breaking space collapsed to a plain one.
 */
export function normalizeText(value) {
    return String(value ?? '')
        .replace(/[\u00a0\u202f\u2009]/g, ' ')
        .trim();
}

/**
 * Wait until the Überblick has finished building its rows.
 *
 * A page that has not rendered yet has no rows either, so an "expected empty" assertion
 * would pass by winning a race. Views sit under a `.view-skeleton` until their child
 * modules are built; once it detaches, "no rows" is a result.
 * @param {import('@playwright/test').Page} page
 */
export async function waitForSummaryRows(page) {
    await page.waitForSelector('.sl-summary-view', { timeout: LOAD_TIMEOUT_MS });
    await page.waitForSelector('.view-skeleton', { state: 'detached', timeout: LOAD_TIMEOUT_MS });
}
