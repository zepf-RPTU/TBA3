/**
 * E2E test: the table filter menu filters the table.
 *
 * Guards the migration of the per-column Tabulator header filters into a single
 * header-action dropdown.
 * The construction path is covered by every table-rendering spec; this one locks
 * the INTERACTION path end to end — open menu → pick a list value → the active
 * row set shrinks → pick "Alle" again → it is restored — plus the fact that no
 * column renders a header filter any more. Clearing every filter at once belongs
 * to the preset Reset, which the second test covers. A regression in descriptor
 * extraction, in the programmatic filter, or in the reset wiring fails here.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const FILTER_TIMEOUT = 5_000;

const ITEM_TABLE = '#item-table';
// The toolbar lives in the module shell around the table host, not inside it.
const ITEM_TABLE_MODULE = `.module-container:has(${ITEM_TABLE})`;
const FILTER_BUTTON = `${ITEM_TABLE_MODULE} button[data-header-action-button="table-filters"]`;
const FILTER_PANEL = `${ITEM_TABLE_MODULE} [data-header-action-control="table-filters"]`;
const EXERCISE_SELECT = `${FILTER_PANEL} [data-table-filter-field="exercise.name"]`;

const CLASS_TABLE = '#ma-class-table-container';
const CLASS_FILTER_PANEL = `${CLASS_TABLE} [data-header-action-control="table-filters"]`;

describe('Table filter menu', () => {
    test('a list filter narrows the rows and clearing it restores them', async ({ page }) => {
        await gotoApp(page, '/en/');

        // Item view (03) renders an item table with the header toolbar + button.
        await page.locator('#itemViewButton').click();
        await page
            .locator('#item-itemLollipop svg')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Tabulator renders rows virtually, so count the real filtered set.
        const activeRows = () =>
            page.evaluate(() => {
                const table = document.querySelector('#item-table .tabulator').tabulator;
                return table.getRows('active').length;
            });

        // No column may still render a Tabulator header filter.
        await expect(page.locator(`${ITEM_TABLE} .tabulator-header-filter`)).toHaveCount(0);

        const unfilteredRows = await activeRows();
        expect(unfilteredRows).toBeGreaterThan(1);

        await page.locator(FILTER_BUTTON).click();
        const exerciseSelect = page.locator(EXERCISE_SELECT);
        await exerciseSelect.waitFor({ state: 'visible', timeout: FILTER_TIMEOUT });

        // First option is the "Alle" clear entry; the second is a real exercise.
        const exercise = await exerciseSelect.locator('option').nth(1).getAttribute('value');
        expect(exercise).toBeTruthy();
        await exerciseSelect.selectOption(exercise);

        await expect
            .poll(async () => await activeRows(), { timeout: FILTER_TIMEOUT })
            .toBeLessThan(unfilteredRows);
        expect(await activeRows()).toBeGreaterThan(0);

        // The active count is advertised on the closed button, so a filter set from
        // elsewhere (MA's KS chart) stays visible too.
        await expect(page.locator(`${FILTER_PANEL} .table-filter-badge`)).toHaveText('1');

        // Back to the "Alle" option: the field's filter is dropped again.
        await exerciseSelect.selectOption('');
        await expect
            .poll(async () => await activeRows(), { timeout: FILTER_TIMEOUT })
            .toBe(unfilteredRows);
        await expect(page.locator(`${FILTER_PANEL} .table-filter-badge`)).toBeHidden();
    });

    test('the preset Reset clears the filter menu (MA class table)', async ({ page }) => {
        // The Kompetenzstufe filter is the one the KS chart also writes through
        // (_setTableFilterValue), and Reset is what has to clear it again — the
        // preset manager owns that hand-off since the filters became programmatic.
        await gotoApp(page, '/ma/');

        await page.locator('#combinedViewButton').click();
        await page
            .locator(`${CLASS_TABLE} .tabulator-row`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        // The nav button lives in the hover-expandable sidebar; keep the pointer off it.
        await page.mouse.move(700, 500);

        const activeRows = () =>
            page.evaluate(() => {
                const table = document.querySelector(
                    '#ma-class-table-container .tabulator',
                ).tabulator;
                return table.getRows('active').length;
            });

        const unfilteredRows = await activeRows();
        expect(unfilteredRows).toBeGreaterThan(1);

        await page
            .locator(`${CLASS_TABLE} button[data-header-action-button="table-filters"]`)
            .click();
        const ksSelect = page.locator(`${CLASS_FILTER_PANEL} [data-table-filter-field="ks"]`);
        await ksSelect.waitFor({ state: 'visible', timeout: FILTER_TIMEOUT });

        const level = await ksSelect.locator('option').nth(1).getAttribute('value');
        expect(level).toBeTruthy();
        await ksSelect.selectOption(level);

        await expect
            .poll(async () => await activeRows(), { timeout: FILTER_TIMEOUT })
            .toBeLessThan(unfilteredRows);

        // Reset is a preset action, not a menu action: it clears the menu values
        // before re-applying the persistent filters.
        await page.locator(`${CLASS_TABLE} [data-table-preset-action="reset"]`).click();
        await expect
            .poll(async () => await activeRows(), { timeout: FILTER_TIMEOUT })
            .toBe(unfilteredRows);
        await expect(page.locator(`${CLASS_FILTER_PANEL} .table-filter-badge`)).toBeHidden();

        // Reopening rebuilds the panel from the (now empty) filter state.
        await page
            .locator(`${CLASS_TABLE} button[data-header-action-button="table-filters"]`)
            .click();
        await expect(ksSelect).toHaveValue('');
    });
});
