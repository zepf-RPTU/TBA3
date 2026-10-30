/**
 * Accessibility: the surfaces that only exist after an interaction.
 *
 * The view sweeps scan what a hash route renders; these surfaces have to be opened
 * first. The file runs on the touch context because four of them are touch-only: the
 * rename pencil, the arming toggle and the popup close button are `display: none` or
 * unrendered under `@media (hover: hover)`, and the report card toolbar is permanently
 * visible only without a hovering pointer.
 *
 * Every scan is scoped with `include` (see `runAxe`).
 */

import { test, expect, TABLET } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS, openListFilter } from './support/app.js';
import { runAxe } from './support/axe.js';
import { exportCart } from './support/cart.js';
import { selectMode } from './support/modes.js';
import {
    expandSidebar,
    openNotes,
    openSidebarSetting,
    openReportWithTwoCards,
    openScatterplotFilter,
} from './support/nav.js';

test.use(TABLET);

/**
 * Scan one subtree and fail on anything serious or critical.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {string} label - What to call it in the failure message.
 */
async function expectClean(page, selector, label) {
    await expect(page.locator(selector).first()).toBeVisible();

    const { blocking, advisory } = await runAxe(page, { include: selector });
    if (advisory.length) {
        console.log(`[axe surface] ${label} advisory:\n  ${advisory.join('\n  ')}`);
    }
    expect(blocking, label).toEqual([]);
}

test.describe('interaction-gated surfaces', () => {
    test('the expanded sidebar rail', async ({ page }) => {
        await gotoApp(page, '/en/');
        await expandSidebar(page);

        // Only expanded are the nav labels, the page's one <h1> and the settings menus
        // readable on a touch device.
        await expectClean(page, '.sidebar', 'expanded sidebar');
    });

    test('an open sidebar settings menu', async ({ page }) => {
        await gotoApp(page, '/en/');
        await openSidebarSetting(page, 'competence-level-theme');

        await expectClean(page, '.sidebar-competence-level-theme-menu', 'sidebar settings menu');
    });

    test('the notes drawer', async ({ page }) => {
        await gotoApp(page, '/en/');
        await openNotes(page);

        await expect(page.locator('.notes-drawer-tab-rename')).toBeVisible();
        await expectClean(page, '.notes-drawer', 'notes drawer');
    });

    test('the scatterplot filter modal', async ({ page }) => {
        await openScatterplotFilter(page);

        await expect(
            page.locator('[data-scatterplot-filter-action="arm-selection"]'),
        ).toBeVisible();
        await expectClean(page, '.scatterplot-filter-modal', 'scatterplot filter modal');
    });

    test('a tapped-open glossary popup', async ({ page }) => {
        // SL's Überblick is the only landing view whose copy carries marked-up terms.
        await gotoApp(page, '/sl/');
        const term = page.locator('.glossary-term').first();
        await term.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await term.tap();

        // The close button exists only on this path, and is the one focusable control
        // inside a `role="tooltip"`.
        await expect(page.locator('.glossary-popup-close')).toBeVisible();
        // The popup fades in: measured mid-fade, its text fails contrast against a
        // background it is still partly transparent over.
        await page
            .locator('.glossary-popup')
            .evaluate((popup) => Promise.all(popup.getAnimations().map((a) => a.finished)));
        await expectClean(page, '.glossary-popup', 'glossary popup');
    });

    test("SL's tables, which only exist in Tabellen mode", async ({ page }) => {
        await gotoApp(page, '/sl/#details');

        // The view sweep sees only this view's charts. Its tables are the only ones
        // with grouped rows and grouped columns, both markup tabulatorAria.js corrects.
        await page.getByRole('button', { name: 'Tabellen', exact: true }).click();
        await page
            .locator("[data-details-section='table:by_subjects'] .tabulator-row")
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        await expectClean(page, "[data-details-section='table:by_subjects']", 'SL domain table');

        // The group table: a row group per Lerngruppe, one of them opened from the
        // keyboard so its rows are swept with the headers of the collapsed rest.
        await selectMode(page, 'by_groups');
        const groupTable = "[data-details-section='table:by_groups']";
        const toggle = page.locator(`${groupTable} .tabulator-group .table-group-toggle`).first();
        await toggle.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.focus();
        await page.keyboard.press('Enter');
        await page
            .locator(`${groupTable} .tabulator-row:not(.tabulator-group)`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        // Tabulator rebuilds the header on a toggle; the new label holds focus and state.
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(toggle).toBeFocused();

        await expectClean(page, groupTable, 'SL group table');
    });

    test('a table filter panel with a list filter expanded', async ({ page }) => {
        await gotoApp(page, '/en/#item');
        // The summary button and its checkbox list exist only once the menu is open and
        // a list filter is expanded.
        await openListFilter(page, '#item-table', 'Aufgabenniveau');
        await expectClean(page, '#item-table .table-filter-panel', 'table filter panel');
    });

    test('the report view with cards in it', async ({ page }) => {
        await openReportWithTwoCards(page);

        // The view sweeps scan #report with an empty cart, so only this pass reaches
        // the card toolbars.
        await expectClean(page, '.report-pages', 'report cards');
    });

    test('the export toolbar with a card ticked', async ({ page }) => {
        // The toolbar shows only while the cart holds a card, which no view sweep does.
        await gotoApp(page, '/en/#overview');
        await exportCart(page, { touch: true }).tickOverviewChart();
        // Scanned mid-fade, every text in it would read low.
        await expect(page.locator('.batch-export-toolbar')).toHaveCSS('opacity', '1');

        await expectClean(page, '.batch-export-toolbar', 'export toolbar');
    });
});

test.describe('table structure for assistive tech', () => {
    test('a grouped header row has one header per data cell, and every row is in the DOM', async ({
        page,
    }) => {
        // A screen reader pairs cells with headers by position: one header more than
        // cells reads every later cell under the wrong one. And a row the renderer left
        // out of the DOM is out of the accessibility tree.
        await gotoApp(page, '/en/#group');
        const table = page.locator('.tabulator').first();
        await table.locator('.tabulator-row').first().waitFor({ timeout: LOAD_TIMEOUT_MS });

        const shape = await table.evaluate((root) => ({
            headers: root.querySelectorAll('.tabulator-headers [role="columnheader"]').length,
            cells: root.querySelector('.tabulator-row')?.querySelectorAll('[role="gridcell"]')
                .length,
            groupPrefixes: root.querySelectorAll('.column-group-prefix').length,
        }));
        expect(shape.headers).toBe(shape.cells);
        expect(shape.groupPrefixes).toBeGreaterThan(0);

        await gotoApp(page, '/en/#item');
        const itemRows = page.locator('#item-table .tabulator-row');
        await itemRows.first().waitFor({ timeout: LOAD_TIMEOUT_MS });
        // The fixture's 79 items, every one; a virtual renderer attached 20 of them.
        expect(await itemRows.count()).toBe(79);
    });
});
