/**
 * E2E test: the MA group view's competence-level bar and the group table share one Kompetenzstufe
 * selection.
 *
 * The view wires the bar's `onLevelToggled` to the table's `toggleCompetenceLevelFilter` verb,
 * and the table's `onCompetenceLevelFilterChanged` back to the bar's `updateHighlight`. A segment
 * click toggles its level in the table's filter (several levels filter with OR), and
 * the bar highlights exactly the levels the filter holds.
 */

import { test, expect } from './support/test.js';
import { activeRowCount, gotoApp, LOAD_TIMEOUT_MS, tableData } from './support/app.js';

const COMPETENCE_LEVEL_BAR = '#ma-group-competence-level-bar';
const GROUP_TABULATOR = '#ma-group-table .tabulator';

/**
 * The Kompetenzstufen of the rows the table's filters let through.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The distinct levels, sorted.
 */
const activeLevels = async (page) =>
    [
        ...new Set(
            (await tableData(page, GROUP_TABULATOR, 'active')).map((row) =>
                String(row.competenceLevelName),
            ),
        ),
    ].sort();

test.describe('MA group view – competence-level bar toggles levels in the table filter', () => {
    test('two segment clicks filter to both levels; clicking one again drops it', async ({
        page,
    }) => {
        await gotoApp(page, '/ma/#group');
        await page
            .locator(`${GROUP_TABULATOR} .tabulator-row`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        const segments = page.locator(`${COMPETENCE_LEVEL_BAR} rect.bar-segment`);
        await segments.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // Two levels some student holds, so each click visibly filters; a third keeps
        // two levels short of the unfiltered table.
        const heldLevels = await activeLevels(page);
        // d3 keeps a segment's bound datum on `__data__`; its `field` is the level.
        const drawnLevels = await segments.evaluateAll((rects) =>
            rects.map(
                (rect) =>
                    /** @type {Element & {__data__?: {field: string}}} */ (rect).__data__?.field ??
                    '',
            ),
        );
        const levels = drawnLevels.filter((level) => heldLevels.includes(level));
        expect(levels.length).toBeGreaterThan(2);
        const [first, second] = levels;
        const segment = (/** @type {string} */ level) => segments.nth(drawnLevels.indexOf(level));
        const highlighted = page.locator(`${COMPETENCE_LEVEL_BAR} rect.bar-segment.highlighted`);

        const activeRows = () => activeRowCount(page, GROUP_TABULATOR);
        const unfilteredRows = await activeRows();

        await segment(first).click();
        await expect.poll(() => activeLevels(page)).toEqual([first]);
        await expect(highlighted).toHaveCount(1);
        await expect(segment(first)).toHaveClass(/\bhighlighted\b/);
        const oneLevelRows = await activeRows();

        await segment(second).click();
        await expect.poll(() => activeLevels(page)).toEqual([first, second].sort());
        await expect(highlighted).toHaveCount(2);
        await expect(segment(first)).toHaveClass(/\bhighlighted\b/);
        await expect(segment(second)).toHaveClass(/\bhighlighted\b/);
        const twoLevelRows = await activeRows();
        expect(twoLevelRows).toBeGreaterThan(oneLevelRows);
        expect(twoLevelRows).toBeLessThan(unfilteredRows);

        await segment(first).click();
        await expect.poll(() => activeLevels(page)).toEqual([second]);
        await expect(highlighted).toHaveCount(1);
        await expect(segment(second)).toHaveClass(/\bhighlighted\b/);
    });
});
