/**
 * E2E test: MA group table scopes to a Leitidee via the Aufgabenpool menu in its toolbar.
 *
 * Switching from "Gesamt" to a Leitidee drops the Kompetenzstufe column (the competence
 * level is undefined per Leitidee), shrinks each row's "x von N" to the student's items
 * in that Leitidee, and swaps the subtitle's whole-booklet line for the subset-size hint.
 * Reset returns to the whole booklet.
 */

import { test, expect, REVEAL_TIMEOUT_MS } from './support/test.js';
import {
    activeRowCount,
    filterMenuButton,
    gotoApp,
    LOAD_TIMEOUT_MS,
    menuRow,
    tableData,
} from './support/app.js';

const GROUP_TABLE = '#ma-group-table';
const GROUP_TABULATOR = `${GROUP_TABLE} .tabulator`;
const POOL_HINT = `${GROUP_TABLE} .content-module-subtitle`;
const POOL_BUTTON = `${GROUP_TABLE} [data-header-action-button="item-pool"]`;
const COL_TITLES = `${GROUP_TABLE} .tabulator-col-title`;

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const columnTitles = (page) => page.locator(COL_TITLES).allInnerTexts();

/**
 * The N of every row's "x von N".
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number[]>} The totals, in row order.
 */
const richtigTotals = async (page) =>
    (await tableData(page, GROUP_TABULATOR)).map((row) => /** @type {number} */ (row.totalCount));

/**
 * Open the Aufgabenpool menu and return one of its rows.
 * @param {import('@playwright/test').Page} page
 * @param {string} poolId - The pool's id, the row's `data-menu-item-id`.
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openPoolRow(page, poolId) {
    await page.locator(POOL_BUTTON).click();
    return menuRow(page.locator(GROUP_TABLE), poolId);
}

/**
 * Pick a pool in the Aufgabenpool menu; the pick closes the menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} poolId
 */
async function selectPool(page, poolId) {
    await (await openPoolRow(page, poolId)).click();
}

/**
 * Ids of the pools the menu offers, in order; the menu is closed again.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function poolIds(page) {
    const first = await openPoolRow(page, 'all');
    await first.waitFor({ state: 'visible', timeout: REVEAL_TIMEOUT_MS });
    const ids = await page
        .locator(`${GROUP_TABLE} [role="menuitemradio"]`)
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-menu-item-id') ?? ''));
    await page.keyboard.press('Escape');
    return ids;
}

test.describe('MA group view – Aufgabenpool menu scopes the table', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/ma/#group');
        await page
            .locator(`${GROUP_TABLE} .tabulator-row`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    });

    test('switching to a Leitidee drops the competence level, rescopes "Richtig", shows the hint', async ({
        page,
    }) => {
        const ids = await poolIds(page);
        expect(ids.length).toBeGreaterThan(1);
        expect(ids[0]).toBe('all');
        const leitidee = ids[1];

        const initialTitles = await columnTitles(page);
        expect(initialTitles).toContain('Kompetenzstufe');
        expect(initialTitles).toContain('Richtig');
        const gesamtTotals = await richtigTotals(page);
        await expect(
            page.locator(`${GROUP_TABLE} .tabulator-cell[tabulator-field="correctCount"]`).first(),
        ).toHaveText(/^\d+ von \d+$/);
        await expect(page.locator(POOL_HINT)).toContainText('Testheft');

        await selectPool(page, leitidee);

        // Polled on a non-empty title list, so an empty mid-rebuild read cannot pass.
        await expect
            .poll(async () => {
                const t = await columnTitles(page);
                return t.length > 0 && !t.includes('Kompetenzstufe');
            })
            .toBe(true);

        // Every row's N is the student's items in the Leitidee, fewer than the booklet's.
        const scopedTotals = await richtigTotals(page);
        expect(scopedTotals).toHaveLength(gesamtTotals.length);
        expect(scopedTotals.every((n, i) => n > 0 && n < gesamtTotals[i])).toBe(true);

        await expect(page.locator(POOL_HINT)).toBeVisible();
        await expect(page.locator(POOL_HINT)).toContainText('Leitidee');

        await selectPool(page, 'all');
        await expect.poll(async () => await columnTitles(page)).toContain('Kompetenzstufe');
        await expect(page.locator(POOL_HINT)).toContainText('Testheft');
    });

    test('Reset returns a Leitidee to the whole booklet', async ({ page }) => {
        const [, leitidee] = await poolIds(page);
        await selectPool(page, leitidee);
        await expect(page.locator(POOL_HINT)).toContainText('Leitidee');
        await expect.poll(async () => await columnTitles(page)).not.toContain('Kompetenzstufe');

        await page.locator(`${GROUP_TABLE} [data-header-action-button="table-reset"]`).click();

        await expect.poll(async () => await columnTitles(page)).toContain('Kompetenzstufe');
        await expect(page.locator(POOL_HINT)).toContainText('Testheft');
        await expect(await openPoolRow(page, 'all')).toHaveAttribute('aria-checked', 'true');
    });

    test('a Leitidee greys out the Stufengrenze preset, which then applies nothing', async ({
        page,
    }) => {
        const ids = await poolIds(page);
        const leitidee = ids[1];
        const presets = page.locator(`${GROUP_TABLE} .table-preset-container [data-preset-index]`);
        const nearBoundary = presets.nth(2);
        const activeRows = () => activeRowCount(page, GROUP_TABULATOR);

        await expect(presets).toHaveText([
            'Stärkste 5',
            'Schwächste 5',
            'Knapp an der Stufengrenze',
        ]);
        await expect(nearBoundary).not.toHaveAttribute('aria-disabled');

        // A Leitidee has no Kompetenzstufe: the preset keeps its place, greyed out.
        await selectPool(page, leitidee);
        await expect(nearBoundary).toHaveAttribute('aria-disabled', 'true');
        await expect(presets).toHaveCount(3);
        await expect.poll(async () => (await columnTitles(page)).length).toBeGreaterThan(0);
        const scopedRows = await activeRows();

        // Forced: Playwright counts aria-disabled as not clickable, but a pointer still
        // reaches the button, and the click must apply nothing.
        await nearBoundary.click({ force: true });
        await expect(nearBoundary).toHaveAttribute('aria-pressed', 'false');
        expect(await activeRows()).toBe(scopedRows);

        await selectPool(page, 'all');
        await expect(nearBoundary).not.toHaveAttribute('aria-disabled');
        await nearBoundary.click();
        await expect(nearBoundary).toHaveAttribute('aria-pressed', 'true');
    });

    test('an active filter survives a pool switch', async ({ page }) => {
        const ids = await poolIds(page);
        const leitidee = ids[1];
        const filterPanel = `${GROUP_TABLE} .header-action-dropdown-wrapper:has(> [data-header-action-button="table-filters"])`;
        const nameFilter = page.locator(filterPanel).getByLabel('Name', { exact: true });
        const activeRows = () => activeRowCount(page, GROUP_TABULATOR);

        await filterMenuButton(page, GROUP_TABLE).click();
        await nameFilter.waitFor({ state: 'visible', timeout: REVEAL_TIMEOUT_MS });
        await nameFilter.fill('b');

        await expect.poll(activeRows).toBeLessThan(25);
        const filteredRows = await activeRows();
        expect(filteredRows).toBeGreaterThan(0);

        // Closed so the reopen below rebuilds the panel from the live filter state.
        await page.keyboard.press('Escape');
        await selectPool(page, leitidee);
        await expect
            .poll(async () => {
                const t = await columnTitles(page);
                return t.length > 0 && !t.includes('Kompetenzstufe');
            })
            .toBe(true);

        await expect.poll(activeRows).toBe(filteredRows);
        await filterMenuButton(page, GROUP_TABLE).click();
        await expect(nameFilter).toHaveValue('b');
    });

    test('a burst of switches ends on the last pool chosen', async ({ page }) => {
        // The table re-scopes one switch at a time, each to the latest pool: two quick
        // switches leave the second one's rows, not those of whichever swap finished last.
        const ids = await poolIds(page);
        expect(ids.length).toBeGreaterThan(2);
        const [, first, second] = ids;

        await selectPool(page, second);
        await expect
            .poll(async () => (await columnTitles(page)).includes('Kompetenzstufe'))
            .toBe(false);
        const secondTotals = await richtigTotals(page);
        await selectPool(page, 'all');
        await expect.poll(async () => await columnTitles(page)).toContain('Kompetenzstufe');

        await selectPool(page, first);
        await selectPool(page, second);

        await expect.poll(() => richtigTotals(page)).toEqual(secondTotals);
        await expect(await openPoolRow(page, second)).toHaveAttribute('aria-checked', 'true');
    });
});
