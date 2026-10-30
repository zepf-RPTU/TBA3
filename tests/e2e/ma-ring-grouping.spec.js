/**
 * E2E test: every MA item-ring grid follows one shared grouping. The header's grouping
 * menu switches the rings from the Leitideen to each competence type the items carry
 * (the VERA 3 fixtures: the five Primar Kompetenzen and the Anforderungsbereich); every
 * grid of the app follows, the chart-only focus lands on the new grouping's first ring,
 * and the item table filters by the same values.
 */

import { test, expect } from './support/test.js';
import { activeRowCount, gotoApp, LOAD_TIMEOUT_MS, openListFilter } from './support/app.js';
import { selectMode } from './support/modes.js';
import { openView } from './support/nav.js';

const OVERVIEW_GRID = '#ma-overview-itemRing';
const ITEM_SPLIT_GRID = '#ma-item-itemRing';
const ITEM_CHART_ONLY_GRID = '#ma-item-itemRing-chartOnly';
const ITEM_FOCUS = '#ma-item-focus';
const ITEM_TABLE = '#ma-item-table';

// The 3a_mid fixture's 55 items.
const DEMAND_RINGS = [
    ['Gesamt', '55 Teilaufgaben'],
    ['Reproduzieren', '10 Teilaufgaben'],
    ['Zusammenhänge herstellen', '42 Teilaufgaben'],
    ['Verallgemeinern und Reflektieren', '3 Teilaufgaben'],
];

/**
 * The grid's rings as `[title, item count]`. A title may be broken over two `tspan`
 * lines, which `textContent` runs together, so the comparison ignores whitespace.
 * @param {import('@playwright/test').Page} page
 * @param {string} grid - The grid host.
 * @returns {Promise<string[][]>} One pair per ring, in grid order.
 */
async function ringTitles(page, grid) {
    return page
        .locator(`${grid} .item-ring-card`)
        .evaluateAll((cards) =>
            cards.map((card) => [
                (card.querySelector('.item-ring-svg-title')?.textContent ?? '').replace(/\s+/g, ''),
                card.querySelector('.item-ring-svg-count')?.textContent ?? '',
            ]),
        );
}

/** @param {string[][]} rings - Expected `[title, count]` pairs. */
const compact = (rings) => rings.map(([title, count]) => [title.replace(/\s+/g, ''), count]);

/**
 * Pick a grouping in a grid's header menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} grid - The grid host.
 * @param {string} label
 */
async function chooseGrouping(page, grid, label) {
    const host = page.locator(grid);
    await host.locator('[data-header-action-button="ring-grouping"]').click();
    await host.getByRole('menuitemradio', { name: label }).click();
}

test.describe('MA item-ring grouping', () => {
    test('regroups every grid of the app and names the grouping', async ({ page }) => {
        await gotoApp(page, '/ma/#overview');
        await expect(page.locator(`${OVERVIEW_GRID} .item-ring-card`).first()).toBeVisible({
            timeout: LOAD_TIMEOUT_MS,
        });
        await expect(page.locator(`${OVERVIEW_GRID} .content-module-subtitle`)).toHaveText(
            'Gruppiert nach Leitidee',
        );

        await chooseGrouping(page, OVERVIEW_GRID, 'Anforderungsbereich');
        await expect.poll(() => ringTitles(page, OVERVIEW_GRID)).toEqual(compact(DEMAND_RINGS));
        await expect(page.locator(`${OVERVIEW_GRID} .content-module-subtitle`)).toHaveText(
            'Gruppiert nach Anforderungsbereich',
        );

        // An item tagged with two Kompetenzen sits in both rings, so the rings sum past Gesamt.
        await chooseGrouping(page, OVERVIEW_GRID, 'Allgemeine Kompetenz');
        await expect
            .poll(async () => (await ringTitles(page, OVERVIEW_GRID)).map(([title]) => title))
            .toEqual([
                'Gesamt',
                'Problemlösen',
                'Kommunizieren',
                'Argumentieren',
                'Modellieren',
                'Darstellen',
            ]);

        // The grouping is the app's: the item view's grid opens in it.
        await openView(page, { button: '#itemViewButton', content: '.item-view-content' });
        await expect
            .poll(async () => (await ringTitles(page, ITEM_SPLIT_GRID)).map(([title]) => title))
            .toContain('Problemlösen');
    });

    test('moves the chart-only focus to the first ring of the new grouping', async ({ page }) => {
        await gotoApp(page, '/ma/#item');
        await selectMode(page, 'chart-only');
        const selected = page.locator(
            `${ITEM_CHART_ONLY_GRID} .item-ring-card--selectable.selected`,
        );
        await expect(selected).toHaveCount(1, { timeout: LOAD_TIMEOUT_MS });

        await chooseGrouping(page, ITEM_CHART_ONLY_GRID, 'Anforderungsbereich');

        await expect
            .poll(async () =>
                (await selected.locator('.item-ring-svg-title').textContent())?.replace(/\s+/g, ''),
            )
            .toBe('Reproduzieren');
        await expect(page.locator(`${ITEM_FOCUS} .content-module-title`)).toHaveText(
            'Reproduzieren',
        );
        await expect(page.locator(`${ITEM_FOCUS} .content-module-subtitle`)).toHaveText(
            '10 Teilaufgaben',
        );
    });

    test('filters the item table by an Allgemeine Kompetenz', async ({ page }) => {
        await gotoApp(page, '/ma/#item');
        await expect(page.locator(`${ITEM_TABLE} .tabulator-row`).first()).toBeVisible({
            timeout: LOAD_TIMEOUT_MS,
        });

        const options = await openListFilter(page, ITEM_TABLE, 'Allgemeine Kompetenz');
        await expect(options).toHaveText([
            'Problemlösen',
            'Kommunizieren',
            'Argumentieren',
            'Modellieren',
            'Darstellen',
        ]);
        await options.filter({ hasText: 'Modellieren' }).check();

        await expect.poll(() => activeRowCount(page, `${ITEM_TABLE} .tabulator`)).toBe(6);
    });
});
