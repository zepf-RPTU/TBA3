/**
 * Shared helpers for the SL Überblick specs.
 */

import { LOAD_TIMEOUT } from './app.js';

/**
 * German number formatting separates the value from its unit with a non-breaking
 * space, so '78 %' never matches a plain-space literal.
 * @param {unknown} value - Any text content.
 * @returns {string} The text with every thin/non-breaking space collapsed to a plain one.
 */
export function normalizeText(value) {
    return String(value ?? '')
        .replace(/[\u00a0\u202f\u2009]/g, ' ')
        .trim();
}

/**
 * Wait until the Überblick has actually finished building its rows.
 *
 * A fixed timeout cannot serve the assertions below, because two of the four datasets
 * legitimately produce **no** rows — and a page that has not rendered yet also produces
 * none. Every "expected empty" case would then pass by winning a race. Views sit under
 * a `.view-skeleton` until their child modules are built, so waiting for it to detach
 * is what makes "no rows" a result rather than a coin flip.
 * @param {import('playwright').Page} page - The test page.
 */
export async function waitForSummaryRows(page) {
    await page.waitForSelector('.sl-summary-view', { timeout: LOAD_TIMEOUT });
    await page.waitForSelector('.view-skeleton', { state: 'detached', timeout: LOAD_TIMEOUT });
}
