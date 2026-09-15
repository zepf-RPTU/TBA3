/**
 * E2E test: EN item view — item detail panel shows one tab per selected item.
 *
 * The item table allows multi-row selection. The detail panel renders a tab per
 * selected item (in its subtitle slot); selecting a new row switches the active
 * tab to it, clicking a tab shows that item's details, and dropping below two
 * selected items hides the strip again.
 *
 * Selection is driven by clicking a plain (non-interactive) cell — the
 * "Aufgabe" (exercise name) column — so the click toggles Tabulator row
 * selection without triggering the item-number preview overlay.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UI_TIMEOUT = 5_000;

// Cell selector for a stable, non-interactive column to toggle row selection.
const NAME_CELL = '.tabulator-cell[tabulator-field="exercise.name"]';

describe('EN item view – item detail tabs', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/');

        await page.locator('#itemViewButton').click();
        // Item view ready once the table body has rendered rows
        await page
            .locator('#item-table .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    });

    test('selecting rows builds tabs; clicking tabs and deselecting switch/hide them', async ({
        page,
    }) => {
        const rows = page.locator('#item-table .tabulator-row');
        const tabs = page.locator('.en-item-view .item-detail-tab');
        const activeTab = page.locator('.en-item-view .item-detail-tab[aria-selected="true"]');
        // "Nummer:" value — located by its label so row order doesn't matter
        const nummer = page
            .locator('.en-item-view .detail-row')
            .filter({ has: page.locator('.detail-label', { hasText: 'Nummer:' }) })
            .locator('.detail-value');

        // No tabs before any selection
        await expect(tabs).toHaveCount(0);

        // Select two rows → two tabs, newest is active
        await rows.nth(0).locator(NAME_CELL).click();
        await rows.nth(1).locator(NAME_CELL).click();
        await expect(tabs).toHaveCount(2, { timeout: UI_TIMEOUT });
        await expect(activeTab).toHaveCount(1);

        // The active tab (2nd row) drives the shown details
        const secondActiveLabel = (await activeTab.textContent())?.trim();
        const nummerForSecond = (await nummer.textContent())?.trim();
        expect(secondActiveLabel).toBeTruthy();
        expect(nummerForSecond).toBeTruthy();

        // Click the other (inactive) tab → the tab we clicked becomes the active one and
        // its own item number is shown. The clicked tab's label is the oracle; "the label
        // differs" would pass for any wrong tab.
        //
        // `:not([aria-selected="true"])`, not `filter({ hasNot })`: `hasNot` looks for a
        // *descendant* matching the selector, and the state sits on the tab button itself,
        // so the filter matched every tab and always yielded the first one.
        const inactiveTab = page.locator(
            '.en-item-view .item-detail-tab:not([aria-selected="true"])',
        );
        const otherLabel = (await inactiveTab.first().textContent())?.trim();
        expect(otherLabel).not.toBe(secondActiveLabel);
        await inactiveTab.first().click();
        await expect(activeTab).toHaveCount(1);
        await expect(activeTab).toHaveText(otherLabel ?? '', { timeout: UI_TIMEOUT });
        const nummerForOther = (await nummer.textContent())?.trim();
        expect(nummerForOther).not.toBe(nummerForSecond);

        // Back to the first tab: the details return to exactly their earlier value.
        await inactiveTab.first().click();
        await expect(activeTab).toHaveText(secondActiveLabel ?? '', { timeout: UI_TIMEOUT });
        await expect(nummer).toHaveText(nummerForSecond ?? '', { timeout: UI_TIMEOUT });

        // Deselect one row → back to a single selected item → strip hidden
        await rows.nth(0).locator(NAME_CELL).click();
        await expect(tabs).toHaveCount(0, { timeout: UI_TIMEOUT });
    });
});
