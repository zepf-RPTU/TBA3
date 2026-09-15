/**
 * Console and page-error collectors shared by the specs that assert a page stayed
 * error-free across an interaction.
 */

import { expect } from './test.js';

/**
 * Attach console.error + pageerror collectors that persist across navigation.
 * @param {import('playwright').Page} page - The test page.
 * @returns {{consoleErrors: string[], pageErrors: string[]}} The collectors, filled as the page runs.
 */
export function collectErrors(page) {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    return { consoleErrors, pageErrors };
}

/** A blanked/error chart logs a render error; the old teardown path threw uncaught. */
export function assertNoChartErrors({ consoleErrors, pageErrors }) {
    const chartErrors = consoleErrors.filter((t) =>
        /\[ChartRenderer\]|theme refresh failed/.test(t),
    );
    expect(chartErrors, `Unexpected chart errors:\n${chartErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
}
