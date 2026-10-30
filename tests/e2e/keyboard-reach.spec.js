/**
 * E2E tests: the keyboard reaches a view's cards without wading through popups, and
 * every drill-down a pointer has.
 *
 * A glossary term opens its popup only once focus rests on it, and the terms inside a
 * popup and in table cells are no tab stops. Before that, each Tab through annotated
 * prose opened one more popup and walked into it, so the first card control of the MA
 * overview sat 258 Tabs deep. These walk the real tab order at key-repeat speed.
 */

import { test, expect } from './support/test.js';
import { dataTableToggle, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { openDomainTable } from './support/slDomainTable.js';

/** Where each dashboard's walk starts. */
const VIEWS = ['/en/#overview', '/ma/#overview', '/sl/#material'];

/** Tab presses walked per view. */
const PRESSES = 120;

/** The skip link, the sidebar, its settings and the header come before the first card. */
const MAX_TABS_TO_FIRST_CARD = 30;

/**
 * Where focus is after each of `PRESSES` Tabs.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{inPopup: boolean, openPopups: number, cardControl: boolean, svgRoot: boolean}>>} One sample per press.
 */
async function walkTabOrder(page) {
    const samples = [];
    for (let press = 0; press < PRESSES; press++) {
        await page.keyboard.press('Tab');
        samples.push(
            await page.evaluate(() => {
                const active = document.activeElement;
                return {
                    inPopup: Boolean(active?.closest('.glossary-popup')),
                    openPopups: document.querySelectorAll('.glossary-popup:popover-open').length,
                    cardControl: Boolean(active?.closest('.content-module-header-actions')),
                    // A chart's root is no stop: its marks are, one roving stop per chart.
                    svgRoot: active instanceof SVGSVGElement,
                };
            }),
        );
    }
    return samples;
}

test.describe('keyboard reach', () => {
    for (const view of VIEWS) {
        test(`${view}: Tab opens no popup, stops on no chart root and reaches the first card early`, async ({
            page,
        }) => {
            await gotoApp(page, view);

            const samples = await walkTabOrder(page);

            expect(samples.filter((sample) => sample.inPopup)).toHaveLength(0);
            expect(samples.filter((sample) => sample.openPopups > 0)).toHaveLength(0);
            expect(samples.filter((sample) => sample.svgRoot)).toHaveLength(0);
            const firstCard = samples.findIndex((sample) => sample.cardControl);
            expect(firstCard).toBeGreaterThanOrEqual(0);
            expect(firstCard).toBeLessThan(MAX_TABS_TO_FIRST_CARD);
        });
    }
});

test.describe('keyboard drill-downs', () => {
    test('the student id opens the student with Enter, reached from its row', async ({ page }) => {
        await gotoApp(page, '/en/#group');
        const link = page.locator('#en-group-table button.student-id-link').first();
        await link.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        // The table is one tab stop: its links are reached from their row.
        expect(await link.getAttribute('tabindex')).toBe('-1');
        await page.locator('#en-group-table .tabulator-table').focus();

        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowRight');
        await expect(link).toBeFocused();
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/#student$/);
    });

    test('a ring grid is one tab stop whose arrows walk ring to ring', async ({ page }) => {
        await gotoApp(page, '/ma/#overview');
        const grid = page.locator('.item-ring-grid-body').first();
        await grid.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        await expect(grid.locator('svg [tabindex]').first()).toBeAttached({
            timeout: LOAD_TIMEOUT_MS,
        });
        expect(await grid.locator('[tabindex="0"]').count()).toBe(0);
        await grid.focus();

        await page.keyboard.press('ArrowDown');
        const ringOf = () =>
            page.evaluate(() => document.activeElement?.closest('.item-ring-card')?.id ?? null);
        const first = await ringOf();
        expect(first).not.toBeNull();
        await page.keyboard.press('ArrowDown');
        const second = await ringOf();
        expect(second).not.toBeNull();
        expect(second).not.toBe(first);
        await page.keyboard.press('ArrowUp');
        expect(await ringOf()).toBe(first);
    });
});

test.describe('chart data table', () => {
    test('the toggle shows the table by keyboard; a plot-only action stays reachable but inactive', async ({
        page,
    }) => {
        await gotoApp(page, '/ma/#overview');
        const card = page.locator('.overview-competence-level-chart-container');
        const toggle = dataTableToggle(card);
        const orientation = card.locator('[data-header-action-button="orientation-toggle"]');
        await toggle.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        await toggle.focus();
        await page.keyboard.press('Enter');

        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(card.locator('.chart-data-table')).toBeVisible();
        // The orientation turns the plot alone: kept in place, announced unavailable.
        await expect(orientation).toHaveAttribute('aria-disabled', 'true');
        const pressed = await orientation.getAttribute('aria-pressed');
        await orientation.focus();
        await expect(orientation).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(orientation).toHaveAttribute('aria-pressed', /** @type {string} */ (pressed));

        // A table that fits its card is no Tab stop; one that overflows is.
        const tableArea = card.locator('.chart-host-table-area');
        const overflows = await tableArea.evaluate(
            (area) => area.scrollWidth > area.clientWidth || area.scrollHeight > area.clientHeight,
        );
        if (overflows) await expect(tableArea).toHaveAttribute('tabindex', '0');
        else await expect(tableArea).not.toHaveAttribute('tabindex');

        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(card.locator('svg').first()).toBeVisible();
        await expect(orientation).not.toHaveAttribute('aria-disabled');
    });
});

test.describe('navigation', () => {
    test('a nav card is a link that Enter follows, and the new view takes focus and the tab title', async ({
        page,
    }) => {
        await gotoApp(page, '/sl/#summary');
        const card = page.locator('.sl-shared-nav-cards-container a.preview-item').first();
        await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const href = await card.getAttribute('href');
        const before = await page.title();
        await card.focus();

        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(new RegExp(`${href}$`));
        await expect(page.locator('h1.header-module-title')).toBeFocused();
        await expect(page).not.toHaveTitle(before);
    });
});

test.describe('SL tables at the shell floor', () => {
    for (const grouping of /** @type {const} */ (['by_subjects', 'by_groups'])) {
        test(`${grouping}: every Merkmal column shows at 1024 px`, async ({ page }) => {
            await page.setViewportSize({ width: 1024, height: 768 });
            const wrapper = await openDomainTable(page, '/sl/', grouping);

            const traitColumns = wrapper.locator('.tabulator-col[tabulator-field^="trait_"]');
            await expect(traitColumns.first()).toBeAttached({ timeout: LOAD_TIMEOUT_MS });
            const hidden = await traitColumns.evaluateAll(
                (columns) =>
                    columns.filter((column) => getComputedStyle(column).display === 'none').length,
            );
            expect(hidden).toBe(0);
        });
    }
});
