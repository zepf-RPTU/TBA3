/**
 * E2E tests: a sortable column header is a keyboard control.
 *
 * Tabulator sorts on a header click only and never puts a header in the tab order, so
 * without tabulatorAria.js#applyHeaderTabStops every sort in the dashboards is
 * pointer-only. These walk the real tab order to a header and sort it with Enter and
 * Space, reading the result from `aria-sort` and from the progress-bar header's
 * sort-step label rather than from the row order.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';

/** Upper bound on Tab presses before the first table header: the shell's nav and the
    card toolbars come first. */
const MAX_TABS = 150;

/** @param {import('@playwright/test').Page} page */
async function openMaItemView(page) {
    await gotoApp(page, '/ma/#item');
    await page
        .locator('#ma-item-table .tabulator-header')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
}

/**
 * Press Tab until a sortable column header holds focus; returns its field.
 * @param {import('@playwright/test').Page} page
 */
async function tabToSortableHeader(page) {
    for (let press = 0; press < MAX_TABS; press++) {
        await page.keyboard.press('Tab');
        const field = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.matches('.tabulator-col.tabulator-sortable')
                ? active.getAttribute('tabulator-field')
                : null;
        });
        if (field) return field;
    }
    throw new Error(`Tab never reached a sortable column header in ${MAX_TABS} presses`);
}

test.describe('sortable column headers', () => {
    test('are reached with Tab and sort with Enter and Space', async ({ page }) => {
        await openMaItemView(page);

        const field = await tabToSortableHeader(page);
        const header = page.locator(`#ma-item-table .tabulator-col[tabulator-field="${field}"]`);
        await expect(header).toBeFocused();

        const start = await header.getAttribute('aria-sort');
        await page.keyboard.press('Enter');
        await expect(header).not.toHaveAttribute('aria-sort', start ?? '');
        const afterEnter = await header.getAttribute('aria-sort');
        expect(['ascending', 'descending']).toContain(afterEnter);

        await page.keyboard.press(' ');
        await expect(header).not.toHaveAttribute('aria-sort', afterEnter ?? '');
        await expect(header).toBeFocused();
    });

    test('step the progress-bar cycle and name the share in force', async ({ page }) => {
        await openMaItemView(page);

        const bar = page.locator(
            '#ma-item-table .tabulator-col[tabulator-field="percentageCombined"]',
        );
        const step = bar.locator('.progress-bar-sort-active');
        await bar.focus();
        await expect(step).toHaveCount(0);

        await page.keyboard.press('Enter');
        await expect(step).toHaveText('Richtig');

        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await expect(step).toHaveText('Unbearbeitet');
    });
});
