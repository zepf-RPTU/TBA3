/**
 * E2E test: EN item view domain switch - lollipop chart sync
 *
 * Tabulator dispatches dataFiltered from its filter stage, before the new rows are
 * active, so a sync that read the table inside the event would hand the chart the
 * previous domain's items. The table syncs once the refresh is done, and the chart
 * host queues its state updates rather than dropping one that arrives mid-render.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { modeButton } from './support/modes.js';

// Item counts in public/data/en/8a_mid/items.json, the group's own value groups only:
// Hören (ho) and Lesen (le).
const DOMAIN_HO_COUNT = 36;
const DOMAIN_LE_COUNT = 43;
const ALL_COUNT = DOMAIN_HO_COUNT + DOMAIN_LE_COUNT;

test.describe('EN item view – domain switch syncs lollipop chart', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/en/#item');
    });

    test('switching domain0 → domain1 → all shows only the selected items, one strip per domain', async ({
        page,
    }) => {
        // The plot area: the element the chart draws into and would scroll.
        const host = page.locator('#item-itemLollipop .chart-svg-area');
        await host.locator('svg.chart-root').waitFor({
            state: 'visible',
            timeout: LOAD_TIMEOUT_MS,
        });
        const circles = host.locator('.lollipop-circle');
        const strips = host.locator('g.item-strip');
        await expect(circles).toHaveCount(ALL_COUNT);

        // Both domains stack, each strip under its name, so 79 items fit the card at
        // the minimum pitch without a horizontal scroll.
        await expect(strips.locator('.domain-label')).toHaveText(['Hören', 'Lesen']);
        await expect(strips.nth(0).locator('.lollipop-circle')).toHaveCount(DOMAIN_HO_COUNT);
        await expect(host).not.toHaveClass(/chart-content-scroll/);

        await modeButton(page, 'ho').click();
        await expect(circles).toHaveCount(DOMAIN_HO_COUNT);
        await expect(strips).toHaveCount(1);

        await modeButton(page, 'le').click();
        await expect(circles).toHaveCount(DOMAIN_LE_COUNT);
        await expect(strips).toHaveCount(1);

        await modeButton(page, 'all').click();
        await expect(circles).toHaveCount(ALL_COUNT);
        await expect(strips).toHaveCount(2);
    });

    test('selecting a table row narrows the lollipop to that Teilaufgabe', async ({ page }) => {
        const circles = page.locator('#item-itemLollipop .lollipop-circle');
        await expect(circles).toHaveCount(ALL_COUNT, { timeout: LOAD_TIMEOUT_MS });

        // Not the first row: a sync that always kept the first item would pass on it.
        const row = page.locator('#item-table .tabulator-row').nth(2);
        const name = (
            await row.locator('.tabulator-cell[tabulator-field="name"]').innerText()
        ).trim();
        await row.dispatchEvent('click');

        await expect(circles).toHaveCount(1);
        await expect(page.locator('#item-itemLollipop .x-axis .tick text')).toHaveText([name]);
    });
});
