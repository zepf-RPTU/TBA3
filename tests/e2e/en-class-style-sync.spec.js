/**
 * E2E test: the EN class view's style card draws from the class table's `onDataSync`.
 *
 * Regression guard for moving the EN id-stores off module-level singletons and onto the
 * owning view, passed to writer and reader through `options`. In the class view the style
 * card creates *no* renderer on its own pass — `styleChartConfig.prepare()` returns null
 * and defers to the first `applySync`, whose payload carries studentIds only. So the
 * card can only draw if `EnClassTableModule` wrote the view's `studentStore` and
 * `styleChartConfig` resolved the ids back out of that same store. Break either half of
 * that wiring — a mistyped option key, a store the view forgot to pass, a view that
 * forgot the `onDataSync` closure — and the error lands in `triggerCallback`'s catch,
 * which only console.errors: the card then stays empty and no other spec notices.
 *
 * Filtering the table to nothing and back exercises the other end of the resolution: an
 * empty id list must reach the placeholder, and a repopulated one must bring the chart
 * back rather than leave the card on the placeholder for good.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const RENDER_TIMEOUT = 10_000;

const STYLE_CARD = '#en-class-spider-chart';
const CLASS_TABLE = '#en-class-table';

test('the class style card draws the students the table syncs by id', async ({ page }) => {
    await gotoApp(page, '/en/');
    await page.locator('#classViewButton').click();
    await page.waitForSelector(`${CLASS_TABLE} .tabulator-row`, { timeout: LOAD_TIMEOUT });

    // Deferred creation: an SVG here proves the first sync payload resolved to records.
    await expect(page.locator(`${STYLE_CARD} svg`)).toHaveCount(1, { timeout: RENDER_TIMEOUT });

    // Filtering is driven through Tabulator's own API — the columns render no header
    // filters (see table-filter-menu.spec.js); what matters here is the resulting
    // dataFiltered → onDataSync → applySync hop, not which control triggered it.
    const setNameFilter = (value) =>
        page.evaluate((name) => {
            const table = document.querySelector(`#en-class-table .tabulator`).tabulator;
            if (name === null) table.clearFilter(true);
            else table.setFilter('lastName', '=', name);
        }, value);

    // A name no student carries empties the id list; the card must say so rather than
    // keep drawing the previous roster.
    await setNameFilter('__no_such_student__');
    await expect(page.locator(`${STYLE_CARD} .chart-empty-state`)).toHaveCount(1, {
        timeout: RENDER_TIMEOUT,
    });

    // Clearing it re-syncs a full id list, which has to resolve through the store again.
    await setNameFilter(null);
    await expect(page.locator(`${STYLE_CARD} svg`)).toHaveCount(1, { timeout: RENDER_TIMEOUT });
});
