/**
 * E2E test: the table column-visibility menu toggles a column's visibility.
 *
 * Guards the completed table-system refactor that moved
 * the ~120-line dropdown widget out of tableModule.js into the shared
 * createColumnVisibilityMenu factory (packages/modules/src/common/tables/internal/columnVisibilityMenu.js).
 * The construction path is already covered by every table-rendering spec; this
 * one locks the previously-untested INTERACTION path — open menu → toggle a
 * checked column → the Tabulator header column hides → toggle again → it returns.
 * A regression in getItems/onToggle/redraw wiring would fail here.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const TOGGLE_TIMEOUT = 5_000;

const VISIBILITY_BUTTON = 'button[data-header-action-button="table-columns"]';
const CHECKED_OPTION =
    '[data-header-action-control="table-columns"] button.header-action-checkbox-option[aria-checked="true"]';

describe('Table column-visibility menu', () => {
    test('toggling a menu item hides then restores its Tabulator column', async ({ page }) => {
        await gotoApp(page, '/en/');

        // Item view (03) renders an item table with the header toolbar + button.
        await page.locator('#itemViewButton').click();
        await page
            .locator('#item-itemLollipop svg')
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        const button = page.locator(VISIBILITY_BUTTON).first();
        await button.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // Open the dropdown — buildMenu runs on open and renders one checkbox per
        // toggleable column (getItems reads the live column list).
        await button.click();
        const firstChecked = page.locator(CHECKED_OPTION).first();
        await firstChecked.waitFor({ state: 'visible', timeout: TOGGLE_TIMEOUT });

        // The field this menu item maps to must currently be a visible header column.
        const field = await firstChecked.getAttribute('data-menu-item-id');
        expect(field).toBeTruthy();
        const headerCol = page.locator(`.tabulator-col[tabulator-field="${field}"]`).first();
        await expect(headerCol).toBeVisible();

        // Toggle off → onToggle → #setColumnVisibility(false) + redraw hides the column.
        await firstChecked.click();
        await expect(headerCol).toBeHidden({ timeout: TOGGLE_TIMEOUT });

        // Toggle the same item back on (the menu rebuilds in place, so re-target by
        // field) → the column returns, proving the redraw restores both ways.
        const reopenedOption = page
            .locator(
                `[data-header-action-control="table-columns"] button.header-action-checkbox-option[data-menu-item-id="${field}"]`,
            )
            .first();
        await reopenedOption.click();
        await expect(headerCol).toBeVisible({ timeout: TOGGLE_TIMEOUT });
    });
});
