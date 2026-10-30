/**
 * E2E test: the EN group table's filter menu offers each domain's GER levels.
 *
 * The two GER columns share the title "GER" under their domain's column group, so the
 * menu names the group ("Hören – GER"). Checking one level keeps exactly the students
 * at that level in that domain; unchecking it restores every row. The toolbar's Reset
 * drops such a value and an active preset at once.
 */

import { test, expect } from './support/test.js';
import {
    activeRowCount,
    gotoApp,
    LOAD_TIMEOUT_MS,
    openListFilter,
    tableData,
} from './support/app.js';

const GROUP_TABLE = '#en-group-table';
const GROUP_TABULATOR = `${GROUP_TABLE} .tabulator`;

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} The rows the table's filters let through.
 */
const activeRows = (page) => activeRowCount(page, GROUP_TABULATOR);

test.describe('EN group view – GER filter per domain', () => {
    /** @type {number} The rows before any filter. */
    let unfilteredRows;

    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/#group');
        await page
            .locator(`${GROUP_TABULATOR} .tabulator-row`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        unfilteredRows = await activeRows(page);
    });

    test('a Hören level keeps exactly its students, and unchecking restores every row', async ({
        page,
    }) => {
        const options = await openListFilter(page, GROUP_TABLE, 'Hören – GER');
        const option = options.first();
        const level = (await option.innerText()).trim();
        await option.click();
        await expect(option).toHaveAttribute('aria-checked', 'true');

        await expect.poll(() => activeRows(page)).toBeLessThan(unfilteredRows);
        const kept = await tableData(page, GROUP_TABULATOR, 'active');
        expect(kept.length).toBeGreaterThan(0);
        expect(kept.every((row) => row.d0Ger === level)).toBe(true);

        await option.click();
        await expect(option).toHaveAttribute('aria-checked', 'false');
        await expect.poll(() => activeRows(page)).toBe(unfilteredRows);
    });

    test('Reset drops a filter-menu value and an active preset', async ({ page }) => {
        const preset = page.locator(`${GROUP_TABLE} [data-preset-index="0"]`);
        const filterBadge = page.locator(`${GROUP_TABLE} .table-filter-badge`);

        const options = await openListFilter(page, GROUP_TABLE, 'Hören – GER');
        await options.first().click();
        await page.keyboard.press('Escape');
        await expect.poll(() => activeRows(page)).toBeLessThan(unfilteredRows);
        await expect(filterBadge).toBeVisible();
        await preset.click();
        await expect(preset).toHaveAttribute('aria-pressed', 'true');

        await page.locator(`${GROUP_TABLE} [data-header-action-button="table-reset"]`).click();

        await expect(preset).toHaveAttribute('aria-pressed', 'false');
        await expect(filterBadge).toBeHidden();
        await expect.poll(() => activeRows(page)).toBe(unfilteredRows);
    });
});
