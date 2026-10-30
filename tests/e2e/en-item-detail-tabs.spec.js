/**
 * E2E test: EN item view — item detail panel shows one tab per selected item.
 *
 * The item table allows multi-row selection. The detail panel renders a tab per
 * selected item (in its subtitle slot); selecting a new row switches the active
 * tab to it, clicking a tab shows that item's details, and dropping below two
 * selected items hides the strip again.
 *
 * Rows are selected by clicking the plain "Aufgabe" (exercise name) cell, which toggles
 * Tabulator row selection without opening the item-number preview overlay.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';

const NAME_CELL = '.tabulator-cell[tabulator-field="exerciseName"]';

test.describe('EN item view – item detail tabs', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/#item');
        await page
            .locator('#item-table .tabulator-row')
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
    });

    test('selecting rows builds tabs; clicking tabs and deselecting switch/hide them', async ({
        page,
    }) => {
        const rows = page.locator('#item-table .tabulator-row');
        const tabs = page.locator('.en-item-view .item-detail-tab');
        const activeTab = page.locator('.en-item-view .item-detail-tab[aria-selected="true"]');
        // The line that names the shown item: "<tab label> – <exercise name>".
        const heading = page.locator('.en-item-view .item-detail-content .detail-heading');
        /** @returns {Promise<string | undefined>} The tab label the heading names. */
        const headingLabel = async () => (await heading.textContent())?.split('–')[0].trim();

        await expect(tabs).toHaveCount(0);

        await rows.nth(0).locator(NAME_CELL).click();
        await rows.nth(1).locator(NAME_CELL).click();
        await expect(tabs).toHaveCount(2);
        // The tab of the row selected last is the one shown: no row group, so the second
        // rendered row is the second active one.
        const secondItemId = await page
            .locator('#item-table .tabulator')
            .evaluate(
                (/** @type {import('./support/app.js').TableHost} */ el) =>
                    el.tabulator.getRows('active')[1].getData().iqbId,
            );
        await expect(activeTab).toHaveAttribute('data-item-id', String(secondItemId));

        const secondActiveLabel = (await activeTab.textContent())?.trim();
        expect(secondActiveLabel).toBeTruthy();
        await expect.poll(headingLabel).toBe(secondActiveLabel);
        const headingForSecond = (await heading.textContent())?.trim();

        // The clicked tab's label is the oracle; "the label differs" would pass for any
        // wrong tab.
        //
        // `:not([aria-selected="true"])`, not `filter({ hasNot })`: `hasNot` looks for a
        // descendant, and the state sits on the tab button itself, so that filter would
        // match every tab and always yield the first one.
        const inactiveTab = page.locator(
            '.en-item-view .item-detail-tab:not([aria-selected="true"])',
        );
        const otherLabel = (await inactiveTab.first().textContent())?.trim();
        expect(otherLabel).not.toBe(secondActiveLabel);
        await inactiveTab.first().click();
        await expect(activeTab).toHaveCount(1);
        await expect(activeTab).toHaveText(otherLabel ?? '');
        await expect.poll(headingLabel).toBe(otherLabel);

        await inactiveTab.first().click();
        await expect(activeTab).toHaveText(secondActiveLabel ?? '');
        await expect(heading).toHaveText(headingForSecond ?? '');

        await rows.nth(0).locator(NAME_CELL).click();
        await expect(tabs).toHaveCount(0);
    });
});
