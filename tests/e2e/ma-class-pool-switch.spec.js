/**
 * E2E test: MA class table scopes to a Leitidee via the task-pool selector.
 *
 * Smoke guard for the differentiation feature. The selector lives in the class
 * table module's *subtitle* slot (under the "Klassenübersicht" title bar) and is
 * re-rendered whenever the table is rebuilt, so this also guards the delegated
 * change wiring that has to survive that rebuild.
 *
 * Switching from "Gesamt" to a Leitidee must: drop the Kompetenzstufe column (KS
 * is undefined per Leitidee), shrink the "Richtig (von N)" denominator to the
 * subset size, and reveal the subset-size hint.
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

const CLASS_TABLE = '#ma-class-table-container';
const POOL_HOST = '#ma-class-pool-selector';
const POOL_HINT = '#ma-class-pool-hint';
const POOL_SELECT = 'select[data-pool-select]';
const COL_TITLES = `${CLASS_TABLE} .tabulator-col-title`;

const columnTitles = (page) => page.locator(COL_TITLES).allInnerTexts();

/** Select a pool by id. */
const selectPool = (page, poolId) => page.selectOption(POOL_SELECT, poolId);

/** Ids of the pools the selector offers, in order. */
const poolIds = (page) =>
    page.locator(`${POOL_SELECT} option`).evaluateAll((els) => els.map((e) => e.value));

describe('MA class view – task-pool selector scopes the table', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/ma/');
        await page.locator('#combinedViewButton').click();
        await page
            .locator(`${CLASS_TABLE} .tabulator-row`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        // The nav button lives in the hover-expandable sidebar (fixed, z-index 1000).
        // Move the pointer into the content so the collapsed sidebar rail (60px)
        // does not overlay the left-most pool controls during clicks.
        await page.mouse.move(700, 500);
    });

    test('the selector is rendered inside the class table module subtitle', async ({ page }) => {
        const host = page.locator(POOL_HOST);
        await expect(host).toHaveCount(1);

        // It must sit in the shared shell's subtitle slot of the class table module,
        // not as a standalone block above the module.
        const placement = await host.evaluate((el) => ({
            insideSubtitle: !!el.closest('.content-module-subtitle'),
            insideTableModule: !!el.closest('#ma-class-table-container'),
        }));
        expect(placement).toEqual({ insideSubtitle: true, insideTableModule: true });
    });

    test('switching to a Leitidee drops KS, rescopes "Richtig", shows the hint', async ({
        page,
    }) => {
        const ids = await poolIds(page);
        expect(ids.length).toBeGreaterThan(1);
        expect(ids[0]).toBe('all');
        const leitidee = ids[1];

        // Gesamt pool: Kompetenzstufe column present, whole-booklet denominator, no hint.
        const initialTitles = await columnTitles(page);
        expect(initialTitles).toContain('Kompetenzstufe');
        const gesamtRichtig = initialTitles.find((t) => t.startsWith('Richtig'));
        expect(gesamtRichtig).toBeTruthy();
        await expect(page.locator(POOL_HINT)).toBeHidden();

        await selectPool(page, leitidee);

        // Table rebuilds scoped to the Leitidee: Kompetenzstufe column is gone.
        // (Poll on a non-empty title list so a mid-rebuild empty read can't pass.)
        await expect
            .poll(
                async () => {
                    const t = await columnTitles(page);
                    return t.length > 0 && !t.includes('Kompetenzstufe');
                },
                { timeout: UPDATE_TIMEOUT },
            )
            .toBe(true);

        // "Richtig (von N)" denominator now reflects the Leitidee subset size.
        const scopedTitles = await columnTitles(page);
        const scopedRichtig = scopedTitles.find((t) => t.startsWith('Richtig'));
        expect(scopedRichtig).toBeTruthy();
        expect(scopedRichtig).not.toBe(gesamtRichtig);

        // Subset-size hint becomes visible, still inside the subtitle.
        await expect(page.locator(POOL_HINT)).toBeVisible();

        // Switching back to Gesamt restores the Kompetenzstufe column and hides the hint.
        await selectPool(page, 'all');
        await expect
            .poll(async () => await columnTitles(page), { timeout: UPDATE_TIMEOUT })
            .toContain('Kompetenzstufe');
        await expect(page.locator(POOL_HINT)).toBeHidden();
    });

    test('re-scopes in place: the module shell and Tabulator instance are not rebuilt', async ({
        page,
    }) => {
        const ids = await poolIds(page);
        const leitidee = ids[1];

        // Tag the shell nodes; if the module were destroyed and recreated (the old
        // behaviour), these nodes would be replaced and the probes would vanish —
        // that rebuild is exactly what made the presets and action buttons flicker.
        await page.evaluate(() => {
            document.querySelector(
                '#ma-class-table-container .content-module-header',
            ).dataset.probe = 'header';
            document.querySelector('.table-preset-container').dataset.probe = 'presets';
            document.querySelector('#ma-class-pool-selector').dataset.probe = 'selector';
            window.__tabulatorEl = document.querySelector('#ma-class-table-container .tabulator');
        });

        const shellIntact = () =>
            page.evaluate(() => ({
                header: !!document.querySelector(
                    '#ma-class-table-container .content-module-header[data-probe="header"]',
                ),
                presets: !!document.querySelector('.table-preset-container[data-probe="presets"]'),
                selector: !!document.querySelector(
                    '#ma-class-pool-selector[data-probe="selector"]',
                ),
                sameTable:
                    window.__tabulatorEl ===
                    document.querySelector('#ma-class-table-container .tabulator'),
            }));

        await selectPool(page, leitidee);
        await expect
            .poll(
                async () => {
                    const t = await columnTitles(page);
                    return t.length > 0 && !t.includes('Kompetenzstufe');
                },
                { timeout: UPDATE_TIMEOUT },
            )
            .toBe(true);

        expect(await shellIntact()).toEqual({
            header: true,
            presets: true,
            selector: true,
            sameTable: true,
        });

        await selectPool(page, 'all');
        await expect
            .poll(async () => await columnTitles(page), { timeout: UPDATE_TIMEOUT })
            .toContain('Kompetenzstufe');

        expect(await shellIntact()).toEqual({
            header: true,
            presets: true,
            selector: true,
            sameTable: true,
        });
    });

    test('the preset row drops the Kompetenzstufe-based presets on a Leitidee', async ({
        page,
    }) => {
        const ids = await poolIds(page);
        const leitidee = ids[1];
        const presetLabels = () =>
            page.locator('.table-preset-container [data-preset-index]').allInnerTexts();

        // Gesamt: Stärkste 5, Schwächste 5, ±1 Schwellenwert.
        expect(await presetLabels()).toHaveLength(4);

        // A Leitidee has no Kompetenzstufe, so the ±Schwellenwert presets must go.
        await selectPool(page, leitidee);
        await expect
            .poll(async () => (await presetLabels()).length, { timeout: UPDATE_TIMEOUT })
            .toBe(2);
        expect(await presetLabels()).toEqual(['Stärkste 5', 'Schwächste 5']);

        await selectPool(page, 'all');
        await expect
            .poll(async () => (await presetLabels()).length, { timeout: UPDATE_TIMEOUT })
            .toBe(4);
    });

    test('an active filter survives a pool switch', async ({ page }) => {
        const ids = await poolIds(page);
        const leitidee = ids[1];
        const filterPanel = `${CLASS_TABLE} [data-header-action-control="table-filters"]`;
        const nameFilter = page.locator(`${filterPanel} [data-table-filter-field="lastName"]`);

        // Read the real table state: Tabulator renders rows virtually, so counting
        // .tabulator-row nodes reports only the visible window, not the filtered set.
        const activeRows = () =>
            page.evaluate(() => {
                const table = document.querySelector(
                    '#ma-class-table-container .tabulator',
                ).tabulator;
                return table.getRows('active').length;
            });

        // Filtering lives in the header-action menu now; no column renders one.
        await expect(page.locator(`${CLASS_TABLE} .tabulator-header-filter`)).toHaveCount(0);

        await page
            .locator(`${CLASS_TABLE} button[data-header-action-button="table-filters"]`)
            .click();
        await nameFilter.waitFor({ state: 'visible', timeout: UPDATE_TIMEOUT });
        await nameFilter.fill('b');

        await expect
            .poll(async () => await activeRows(), { timeout: UPDATE_TIMEOUT })
            .toBeLessThan(25);
        const filteredRows = await activeRows();
        expect(filteredRows).toBeGreaterThan(0);

        // Close the panel so the pool selector is not overlaid, and so the reopen
        // below rebuilds it from the live filter state rather than showing the DOM
        // the user typed into.
        await page.keyboard.press('Escape');
        await selectPool(page, leitidee);
        await expect
            .poll(
                async () => {
                    const t = await columnTitles(page);
                    return t.length > 0 && !t.includes('Kompetenzstufe');
                },
                { timeout: UPDATE_TIMEOUT },
            )
            .toBe(true);

        // The Name filter is kept across the column swap: same value, same row set.
        await expect
            .poll(async () => await activeRows(), { timeout: UPDATE_TIMEOUT })
            .toBe(filteredRows);
        await page
            .locator(`${CLASS_TABLE} button[data-header-action-button="table-filters"]`)
            .click();
        await expect(nameFilter).toHaveValue('b');
    });
});
