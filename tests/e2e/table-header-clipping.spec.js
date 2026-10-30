/**
 * E2E tests: no table column header clips its content, at any supported viewport and in
 * any sort state.
 *
 * Tabulator pins every header's height as an inline style when it lays the headers out
 * (`ColumnManager.verticalAlignHeaders()`), so content written into a header later, such
 * as the label of the Verteilung sort step in force (progressBarSorting.js), is cut off
 * unless the heights are pinned again. The titles also wrap and are capped at
 * `--table-header-max-lines`, so a column squeezed below its title clamps it.
 *
 * Checked per view across the viewport range, at rest, through every step of each
 * progress-bar column's header-click cycle, and after a preset that sorts by a step.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { waitForSettled } from './support/settle.js';
import { openDomainTable } from './support/slDomainTable.js';

/** The shell minimum (--shell-min-width) up to a large desktop. */
const VIEWPORTS = [
    { width: 1024, height: 600 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
];

/** @typedef {{name: string, open: (page: import('@playwright/test').Page) => Promise<unknown>}} TableView */

/**
 * A dashboard view opened from its hash route.
 * @param {string} path - App path with the view hash.
 * @returns {TableView}
 */
const appView = (path) => ({ name: path, open: (page) => gotoApp(page, path) });

/**
 * The SL Details view in table mode.
 * @param {'by_subjects' | 'by_groups'} grouping
 * @returns {TableView}
 */
const slTableView = (grouping) => ({
    name: `/sl/#details (${grouping} table)`,
    open: (page) => openDomainTable(page, '/sl/', grouping),
});

/** Every view that shows a table. */
const VIEWS = [
    appView('/en/#item'),
    appView('/en/#group'),
    appView('/en/#student'),
    appView('/ma/#item'),
    appView('/ma/#group'),
    appView('/ma/#student'),
    slTableView('by_subjects'),
    slTableView('by_groups'),
];

/** The sortable progress-bar headers: `percentageCombined`, or one per domain. */
const PROGRESS_BAR_HEADER = [
    '.tabulator-col.tabulator-sortable[tabulator-field="percentageCombined"]',
    '.tabulator-col.tabulator-sortable[tabulator-field$="Percentages"]',
].join(', ');

/** The header click cycle of a progress-bar column: three shares, each ↑ then ↓, then unsorted. */
const PROGRESS_BAR_CYCLE_CLICKS = 7;

/**
 * The shown leaf headers whose content overflows the pinned header height, or whose
 * title is clamped.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} One description per clipped header; empty when none is.
 */
function clippedHeaders(page) {
    return page.evaluate(() => {
        const shown = (/** @type {Element} */ element) => element.getClientRects().length > 0;
        const columns = [
            .../** @type {NodeListOf<HTMLElement>} */ (
                document.querySelectorAll(
                    '.tabulator .tabulator-header .tabulator-col:not(.tabulator-col-group)',
                )
            ),
        ].filter(shown);
        if (columns.length === 0) throw new Error('No shown Tabulator header found');

        /** @type {string[]} */
        const clipped = [];
        for (const column of columns) {
            const content = column.querySelector('.tabulator-col-content');
            const title = column.querySelector('.tabulator-col-title');
            if (!content || !title) continue;
            const name = title.textContent?.trim() || column.getAttribute('tabulator-field');
            // The column box too: Tabulator's sheet clips it, and its content box can
            // fit a pinned height that the column's own content outgrows.
            if (column.scrollHeight > column.clientHeight + 1) {
                clipped.push(
                    `"${name}" column overflows (${column.scrollHeight}px in ${column.clientHeight}px)`,
                );
            }
            if (content.scrollHeight > content.clientHeight + 1) {
                clipped.push(
                    `"${name}" overflows (${content.scrollHeight}px in ${content.clientHeight}px)`,
                );
            }
            if (title.scrollHeight > title.clientHeight + 1) {
                clipped.push(
                    `"${name}" title clamped (${title.scrollHeight}px in ${title.clientHeight}px)`,
                );
            }
        }
        return clipped;
    });
}

/**
 * Time a header may take to settle: the post-resize realign is debounced
 * (TableHeaderGeometry), so a resize leaves stale heights for a moment by design.
 */
const SETTLE_TIMEOUT_MS = 2000;

/**
 * Assert that no shown header clips its content once the headers have settled.
 * @param {import('@playwright/test').Page} page
 * @param {string} state - What the table shows, for the failure message.
 */
async function expectHeadersUnclipped(page, state) {
    await waitForSettled(page);
    await expect
        .poll(() => clippedHeaders(page), {
            message: `${page.url()} @ ${page.viewportSize()?.width}px, ${state}`,
            timeout: SETTLE_TIMEOUT_MS,
        })
        .toEqual([]);
}

/**
 * Click each shown progress-bar header through its whole cycle, checking after every step.
 * @param {import('@playwright/test').Page} page
 */
async function cycleProgressBarSorts(page) {
    const headers = page.locator(PROGRESS_BAR_HEADER).filter({ visible: true });
    const count = await headers.count();
    for (let index = 0; index < count; index++) {
        // The sorter, not the title: a glossary term in the title opens its popup on hover.
        const sorter = headers.nth(index).locator('.tabulator-col-sorter');
        for (let click = 1; click <= PROGRESS_BAR_CYCLE_CLICKS; click++) {
            await sorter.click();
            await expectHeadersUnclipped(page, `bar column ${index}, click ${click}`);
        }
    }
}

test.describe('Table column headers never clip their content', () => {
    for (const view of VIEWS) {
        test(`${view.name}: at rest and through every progress-bar sort step`, async ({ page }) => {
            await page.setViewportSize(VIEWPORTS[0]);
            await view.open(page);
            await page
                .locator('.tabulator .tabulator-header')
                .first()
                .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

            for (const viewport of VIEWPORTS) {
                await page.setViewportSize(viewport);
                await expectHeadersUnclipped(page, 'at rest');
                await cycleProgressBarSorts(page);
            }
        });
    }

    test('/en/#item: a preset sorting by a Verteilung share', async ({ page }) => {
        await page.setViewportSize(VIEWPORTS[0]);
        await gotoApp(page, '/en/#item');
        const presets = page.locator('.table-preset-container [data-preset-index]');
        await presets.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        for (const viewport of VIEWPORTS) {
            await page.setViewportSize(viewport);
            await presets.first().click();
            await expectHeadersUnclipped(page, 'first preset applied');
            // Toggle the preset off again for the next viewport.
            await presets.first().click();
        }
    });
});
