/**
 * E2E tests: a table's column-header height depends only on the current
 * viewport, never on the sequence of resizes that led to it.
 *
 * Tabulator measures header heights before it re-lays out the columns:
 * `ColumnManager.redraw()` runs `verticalAlignHeaders()` (which pins the tallest header
 * height as an inline style on `.tabulator-headers` and every `.tabulator-col`) and
 * only then calls `layoutRefresh()` to assign the new `fitColumns` widths. The headers
 * wrap (table-header-layout.css), so that measurement wraps the titles in the old
 * column widths. A title that
 * wraps in that transient state pins an extra line of height that nothing clears, and
 * the same window size renders different header heights depending on how it was
 * reached.
 *
 * TableHeaderGeometry#attach (tableHeaderGeometry.js) corrects it with a debounced
 * non-forced redraw once the resize settles. This fails if that correction is removed
 * (each resize waits for the realign, which then never comes), debounced too short to
 * land after Tabulator's own resize redraw, or switched to `redraw(true)` (which resets
 * the body scroll, asserted below).
 *
 * The assertion is path-independence rather than a pixel count: the correct height
 * changes with the column widths.
 */

import { test, expect } from './support/test.js';
import { gotoApp, gotoChart, LOAD_TIMEOUT_MS } from './support/app.js';
import { waitForSettled } from './support/settle.js';

/** Wider and narrower than the probe width. */
const WIDE_PX = 1900;
// The shell minimum (--shell-min-width): narrower viewports lay out at this width.
const NARROW_PX = 1024;
const PROBE_PX = 1400;
const VIEWPORT_HEIGHT_PX = 900;

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} Each leaf column's inline `width`, which `fitColumns`
 *     rewrites for every table width.
 */
async function columnWidths(page) {
    return page.evaluate(() => {
        const table = [...document.querySelectorAll('.tabulator')].find(
            (element) => element.getClientRects().length > 0,
        );
        if (!table) throw new Error('No shown Tabulator table found');
        return [
            ...table.querySelectorAll('.tabulator-header .tabulator-col:not(.tabulator-col-group)'),
        ].map((col) => /** @type {HTMLElement} */ (col).style.width);
    });
}

/**
 * Resize the window and wait for the post-resize realign: the columns take their new
 * widths in the resize redraw, and the table stays `aria-busy` until the realign has
 * drawn, which `waitForSettled` waits out.
 * @param {import('@playwright/test').Page} page
 * @param {number} width - The new viewport width, in px.
 */
async function setViewport(page, width) {
    const before = await columnWidths(page);
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT_PX });
    await expect.poll(() => columnWidths(page), { timeout: LOAD_TIMEOUT_MS }).not.toEqual(before);
    await waitForSettled(page);
}

/**
 * The header's height, and the heights Tabulator pinned on its columns.
 * @param {import('@playwright/test').Page} page
 */
async function readHeaderMetrics(page) {
    return page.evaluate(() => {
        const header = document.querySelector('.tabulator .tabulator-header');
        if (!header) throw new Error('No Tabulator header found');

        const cols = [
            .../** @type {NodeListOf<HTMLElement>} */ (
                header.querySelectorAll('.tabulator-col:not(.tabulator-col-group)')
            ),
        ];
        if (cols.length === 0) throw new Error('No leaf columns in the Tabulator header');

        return {
            headerHeight: Math.round(header.getBoundingClientRect().height),
            // The inline height verticalAlignHeaders() pinned, which carries the
            // staleness: asserted directly, so a CSS change that masks the symptom
            // cannot make this pass.
            pinnedColumnHeights: [...new Set(cols.map((col) => col.style.height))].sort(),
        };
    });
}

/** @param {import('@playwright/test').Page} page */
async function openItemView(page) {
    // The item view's table and chart build together, the chart last.
    await gotoChart(page, '/en/#item', '#item-itemLollipop');
    // The header, not its first column: the leading columns can be toggled off
    // (display:none), so `.tabulator-col` first() may never be visible.
    await page
        .locator('.tabulator .tabulator-header')
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    await waitForSettled(page);
}

test.describe('Table column-header height stability across resizes', () => {
    test('header height at a given width is the same whether reached from a wider or narrower window', async ({
        page,
    }) => {
        await openItemView(page);

        await setViewport(page, WIDE_PX);
        await setViewport(page, PROBE_PX);
        const fromWide = await readHeaderMetrics(page);

        await setViewport(page, NARROW_PX);
        await setViewport(page, PROBE_PX);
        const fromNarrow = await readHeaderMetrics(page);

        expect(fromNarrow.headerHeight).toBe(fromWide.headerHeight);
        expect(fromNarrow.pinnedColumnHeights).toEqual(fromWide.pinnedColumnHeights);

        // From above a second time, so a pass cannot come from both paths being
        // equally wrong.
        await setViewport(page, WIDE_PX);
        await setViewport(page, PROBE_PX);
        const fromWideAgain = await readHeaderMetrics(page);
        expect(fromWideAgain.headerHeight).toBe(fromWide.headerHeight);
    });

    test('the post-resize realign does not scroll the table body back to the top', async ({
        page,
    }) => {
        // The group view, not the item view: the item view's chart reflows so much on
        // a width change that its table holder's height halves and the browser zeroes
        // the scroll on its own, with or without the realign. The group view is a
        // plain full-height table whose scroll survives a resize.
        await page.setViewportSize({ width: PROBE_PX, height: VIEWPORT_HEIGHT_PX });
        await gotoApp(page, '/en/#group');
        await page
            .locator('.tabulator .tabulator-header')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await waitForSettled(page);

        const tableHolder = page.locator('.tabulator .tabulator-tableholder').first();
        // Without real overflow the scroll assertion would pass vacuously.
        await expect
            .poll(() => tableHolder.evaluate((el) => el.scrollHeight > el.clientHeight + 200), {
                message: 'class table must overflow for the scroll assertion to mean anything',
                timeout: LOAD_TIMEOUT_MS,
            })
            .toBe(true);

        await tableHolder.evaluate((el) => {
            el.scrollTop = 100;
        });
        // The scroll handler's re-render of the visible rows has run.
        await waitForSettled(page);
        expect(await tableHolder.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(0);

        // `table.redraw(true)` calls rowManager.resetScroll() and drives this to 0;
        // the non-forced redraw does not. Row heights change with column width, so the
        // browser may clamp the offset by a few pixels: a floor rather than equality.
        await setViewport(page, 1100);

        expect(await tableHolder.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(50);
    });
});

test.describe('Table scroll position across new rows and a sort', () => {
    test('new rows open at the top; a sort keeps the place', async ({ page }) => {
        await page.setViewportSize({ width: PROBE_PX, height: VIEWPORT_HEIGHT_PX });
        await gotoApp(page, '/en/#student');
        const studentSelect = page.locator('select.control-select').first();
        await studentSelect.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await waitForSettled(page);

        // The student's item table: its rows are swapped for each student.
        const table = page.locator('.tabulator').filter({ has: page.locator('.tabulator-row') });
        const tableHolder = table.last().locator('.tabulator-tableholder');
        await expect
            .poll(() => tableHolder.evaluate((el) => el.scrollHeight > el.clientHeight + 100), {
                message:
                    'the student table must overflow for the scroll assertions to mean anything',
                timeout: LOAD_TIMEOUT_MS,
            })
            .toBe(true);
        const scrollDown = () =>
            tableHolder.evaluate((el) => {
                el.scrollTop = 80;
            });
        const scrollTop = () => tableHolder.evaluate((el) => Math.round(el.scrollTop));

        await scrollDown();
        await waitForSettled(page);
        const sorter = table
            .last()
            .locator('.tabulator-col.tabulator-sortable .tabulator-col-sorter')
            .first();
        await sorter.click();
        await waitForSettled(page);
        expect(await scrollTop()).toBeGreaterThan(0);

        const other = await studentSelect.evaluate(
            (el) =>
                [.../** @type {HTMLSelectElement} */ (el).options].find(
                    (option) => option.value && !option.selected,
                )?.value ?? '',
        );
        await studentSelect.selectOption(other);
        await waitForSettled(page);
        await expect.poll(scrollTop, { timeout: LOAD_TIMEOUT_MS }).toBe(0);
    });
});
