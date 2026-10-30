/**
 * Console and page-error collectors shared by the specs that assert a page stayed
 * error-free across an interaction.
 */

import { expect } from './test.js';

/**
 * What a page logged as an error, by source.
 * @typedef {object} PageErrors
 * @property {string[]} consoleErrors - `console.error` texts.
 * @property {string[]} pageErrors - Uncaught exceptions' messages.
 */

/**
 * Attach console.error + pageerror collectors that persist across navigation.
 * @param {import('@playwright/test').Page} page
 * @returns {PageErrors} The collectors, filled as the page runs.
 */
export function collectErrors(page) {
    /** @type {string[]} */
    const consoleErrors = [];
    /** @type {string[]} */
    const pageErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    return { consoleErrors, pageErrors };
}

/**
 * No uncaught exception reached the page.
 * @param {string[]} pageErrors - `collectErrors(page).pageErrors`.
 */
export function assertNoPageErrors(pageErrors) {
    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
}

/**
 * A blanked/error chart logs a render error.
 * @param {PageErrors} errors - From `collectErrors`.
 */
export function assertNoChartErrors({ consoleErrors, pageErrors }) {
    const chartErrors = consoleErrors.filter((t) => /\[ChartRenderer\]|ChartHostModule\[/.test(t));
    expect(chartErrors, `Unexpected chart errors:\n${chartErrors.join('\n')}`).toEqual([]);
    assertNoPageErrors(pageErrors);
}
