/**
 * Shared boot helpers for the e2e specs.
 *
 * A spec waits for the first view to be revealed before touching anything: the shell
 * shows before the data, and the app queues interaction while it transitions into its
 * default view.
 */

import { expect } from './test.js';
import { LOAD_TIMEOUT_MS } from './timeouts.js';

/**
 * A mounted table's container: the table module exposes its Tabulator instance on the
 * `.tabulator` element (tableModule.js), which specs read inside `page.evaluate` for the
 * table's data rather than its virtual DOM.
 * @typedef {HTMLElement & { tabulator: import('tabulator-tables').Tabulator }} TableHost
 */

export { LOAD_TIMEOUT_MS } from './timeouts.js';

/**
 * The rows a table holds, read from its data rather than the virtual DOM.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - The `.tabulator` element, e.g. `#item-table .tabulator`.
 * @param {import('tabulator-tables').RowRangeLookup} [rowRange] - Which rows, e.g. `'active'`
 *   for those the filters let through; all rows when omitted.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export const tableData = (page, selector, rowRange) =>
    page
        .locator(selector)
        .evaluate((/** @type {TableHost} */ el, range) => el.tabulator.getData(range), rowRange);

/**
 * How many rows pass the table's filters. Tabulator renders rows virtually, so counting
 * `.tabulator-row` nodes reports only the visible window.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - The `.tabulator` element, e.g. `#item-table .tabulator`.
 * @returns {Promise<number>}
 */
export const activeRowCount = (page, selector) =>
    page
        .locator(selector)
        .evaluate((/** @type {TableHost} */ el) => el.tabulator.getRows('active').length);

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} table - The table module, e.g. `#item-table`; it holds the toolbar.
 * @returns {import('@playwright/test').Locator}
 */
export const filterMenuButton = (page, table) =>
    page.locator(`${table} button[data-header-action-button="table-filters"]`);

/**
 * A checkable row (checkbox or radio) of a header-action menu: the ⌀ menu's comparisons,
 * a table's columns.
 * @param {import('@playwright/test').Locator} scope - The module card or the menu holding the row.
 * @param {string} id - The row's `data-menu-item-id`.
 * @returns {import('@playwright/test').Locator}
 */
export const menuRow = (scope, id) =>
    scope.locator(`button[aria-checked][data-menu-item-id="${id}"]`);

/**
 * A module card's ⌀ button, which opens the menu of its comparison groups.
 * @param {import('@playwright/test').Locator} module
 * @returns {import('@playwright/test').Locator}
 */
export const comparisonMenuButton = (module) =>
    module.locator('[data-header-action-button="comparison"]');

/**
 * The "Als Tabelle anzeigen" toggle of the chart cards in `scope`: one card's, or every
 * card's on a page.
 * @param {import('@playwright/test').Locator|import('@playwright/test').Page} scope - A card, or the page.
 * @returns {import('@playwright/test').Locator}
 */
export const dataTableToggle = (scope) =>
    scope.locator('[data-header-action-button="data-table-toggle"]');

/**
 * Open a module's ⌀ menu and return one of its rows.
 * @param {import('@playwright/test').Locator} module
 * @param {string} id - The comparison group's id, the row's `data-menu-item-id`.
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export async function openComparisonRow(module, id) {
    await comparisonMenuButton(module).click();
    return menuRow(module, id);
}

/**
 * Open a table's filter menu and expand one of its list filters.
 * @param {import('@playwright/test').Page} page
 * @param {string} table - The table module, e.g. `#item-table`; it holds the toolbar.
 * @param {string} title - The list filter's label: its column's title.
 * @returns {Promise<import('@playwright/test').Locator>} The list's checkboxes.
 */
export async function openListFilter(page, table, title) {
    await filterMenuButton(page, table).click();
    // The summary button is named by its row label, then the selection it shows.
    const toggle = page
        .locator(`${table} .table-filter-panel`)
        .getByRole('button', { name: new RegExp(`^${title}\\s`) });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const listId = await toggle.getAttribute('aria-controls');
    const options = page.locator(`[id="${listId}"]`).getByRole('checkbox');
    await options.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    return options;
}

/**
 * How far the sidebar is wider than its collapsed rail, `--sidebar-rail-width`
 * (src/styles/foundation/variables.css), resolved on the page: the token is rem.
 * @param {HTMLElement} sidebar
 * @returns {number} In px; at most 0 once collapsed.
 */
function sidebarWidthPastRail(sidebar) {
    const probe = document.createElement('div');
    probe.style.width = 'var(--sidebar-rail-width)';
    document.body.append(probe);
    const rail = probe.getBoundingClientRect().width;
    probe.remove();
    return sidebar.getBoundingClientRect().width - rail;
}

/**
 * What is up while the current view is not ready: a placeholder, a view still covered
 * for its render, or something `aria-busy` — a view or chart host in its render cycle
 * (baseViewModule.js, chartHostModule.js).
 */
export const VIEW_BUSY_SELECTOR =
    '#app-skeleton, .view-skeleton, [data-view-rendering="true"], [aria-busy="true"]';

/**
 * Wait until the current view is revealed and drawn (nothing matches `VIEW_BUSY_SELECTOR`).
 * @param {import('@playwright/test').Page} page
 */
export async function waitForViewReady(page) {
    await page.waitForFunction((busy) => !document.querySelector(busy), VIEW_BUSY_SELECTOR, {
        timeout: LOAD_TIMEOUT_MS,
    });
}

/**
 * Open a dashboard and wait until its sidebar is rendered and its first view is ready.
 * A dashboard that failed to boot fails here with its bootstrap alert's text, rather
 * than as a timeout on whatever the caller waits for next. Specs that expect the alert
 * use `page.goto`.
 * @param {import('@playwright/test').Page} page
 * @param {string} path - App path with optional query and view hash, e.g. `/en/#item` or
 *     `/sl/?scope=schools/sl`.
 */
export async function gotoApp(page, path) {
    await page.goto(path);
    const bootstrapError = page.locator('.dashboard-bootstrap-error');
    await page
        .locator('.sidebar-nav-button, .dashboard-bootstrap-error')
        .first()
        .waitFor({ timeout: LOAD_TIMEOUT_MS });
    await waitForViewReady(page);
    // Checked once the view is ready: the shell shows before the data, so a first view
    // that waits for it fails after the sidebar is up, and takes its placeholder with it.
    if ((await bootstrapError.count()) > 0) {
        throw new Error(`Dashboard failed to boot: ${await bootstrapError.innerText()}`);
    }
}

/**
 * Open a dashboard on a view and wait until one of its charts has drawn.
 * @param {import('@playwright/test').Page} page
 * @param {string} path - App path with the view hash, e.g. `/en/#item`.
 * @param {string} host - The chart host, e.g. `#item-itemLollipop`.
 * @returns {Promise<import('@playwright/test').Locator>} The chart's root svg.
 */
export async function gotoChart(page, path, host) {
    await gotoApp(page, path);
    const chart = page.locator(`${host} svg.chart-root`);
    await chart.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    return chart;
}

/**
 * Take the pointer off the content, into the page's corner: a pointer resting where a
 * glossary term comes to lie opens that term's popup over whatever is clicked next.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export const parkPointer = (page) => page.mouse.move(0, 0);

/**
 * Open a view through its sidebar nav button, take the pointer off the rail, and wait
 * for the rail to collapse and the view to be ready.
 *
 * Playwright leaves the mouse where it clicked, so the rail stays `:hover`-expanded
 * (250px, sidebarModule.css) over the header, whose stacked layout (the controls on a
 * row of their own, at the suite's 1280px viewport) starts its control row under the rail. A following click on the first header
 * control fails the hit-target check, which Playwright runs before it moves the mouse,
 * so the rail never collapses and every retry meets the same interceptor.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - The nav button, e.g. `#itemViewButton`.
 */
export async function clickNav(page, selector) {
    await page.locator(selector).click();
    // Into the content area, clear of the rail's expanded width and of the header.
    await page.mouse.move(640, 400);
    await expect
        .poll(() => page.locator('.sidebar').evaluate(sidebarWidthPastRail))
        .toBeLessThanOrEqual(0.5);
    await waitForViewReady(page);
}

/**
 * Assert that a student name identifies one student: exactly one option of the student
 * select reads it. A spec that follows a click by the clicked name is only sound then;
 * two students with one name would let the wrong one pass.
 * @param {import('@playwright/test').Locator} select - The student `<select>`.
 * @param {string} name - The name as a list shows it, "Nachname, Vorname".
 */
export async function expectNamesOneStudent(select, name) {
    const options = await select.locator('option').allTextContents();
    expect(options.filter((text) => text.trim() === name)).toHaveLength(1);
}
