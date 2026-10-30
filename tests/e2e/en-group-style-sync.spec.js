/**
 * E2E test: the EN group view's style card draws from the group table's `onDataSync`.
 *
 * In the group view the style card creates no renderer on its own pass:
 * `styleGroupChartConfig.createRenderer()` returns null and defers to the first `applySync`, whose
 * payload carries studentIds only, which the card resolves against `en.studentRecords`.
 * A view without the `onDataSync` closure, or ids the dataset does not know, leave the
 * card empty with at most a console error, and no other spec notices.
 *
 * Filtering the table to nothing and back covers the other end: an empty id list must
 * reach the placeholder, and a repopulated one must bring the chart back.
 */

import { test, expect, RENDER_TIMEOUT_MS } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';

const STYLE_CARD = '#en-group-style-chart';
const GROUP_TABLE = '#en-group-table';

test('the group style card draws the students the table syncs by id', async ({ page }) => {
    await gotoApp(page, '/en/#group');
    await page.waitForSelector(`${GROUP_TABLE} .tabulator-row`, { timeout: LOAD_TIMEOUT_MS });

    // Deferred creation: an SVG here proves the first sync payload resolved to records.
    await expect(page.locator(`${STYLE_CARD} svg.chart-root`)).toHaveCount(1, {
        timeout: RENDER_TIMEOUT_MS,
    });

    // Filtered through Tabulator's own API: the dataFiltered → onDataSync → applySync
    // hop is under test, not the control that triggers it.
    /**
     * @param {string | null} value - The last name to filter on, or null to clear.
     * @returns {Promise<void>} Settles once the filter is applied.
     */
    const setNameFilter = (value) =>
        page.evaluate((name) => {
            const table = /** @type {import('./support/app.js').TableHost} */ (
                document.querySelector(`#en-group-table .tabulator`)
            ).tabulator;
            if (name === null) table.clearFilter(true);
            else table.setFilter('lastName', '=', name);
        }, value);

    // An empty id list must reach the placeholder, not leave the previous roster drawn.
    await setNameFilter('__no_such_student__');
    await expect(page.locator(`${STYLE_CARD} .chart-message`)).toHaveCount(1, {
        timeout: RENDER_TIMEOUT_MS,
    });

    await setNameFilter(null);
    await expect(page.locator(`${STYLE_CARD} svg.chart-root`)).toHaveCount(1, {
        timeout: RENDER_TIMEOUT_MS,
    });
});
