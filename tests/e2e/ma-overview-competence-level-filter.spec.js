/**
 * E2E test: MA overview item-ring grid reacts to the competence-level filter.
 *
 * The view wires the competence-level chart's `onLevelSelected` to the grid's
 * `setCompetenceLevelFilter` verb, whose controller resolves the student slice from the
 * grid's student records and writes it to the host's selection signal, which every ring
 * shares (highlighting / success-rate tick).
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { waitForSettled } from './support/settle.js';

const ITEM_RING = '#ma-overview-itemRing';
const COMPETENCE_LEVEL_CHART = '#ma-overview-competenceLevelDistribution';

/**
 * Read a tick's `transform` once it has stopped moving.
 *
 * The tick animates into position, so a single read, or an `expect.poll` that stops at
 * the first differing sample, compares transient values and reports "the angle changed"
 * for any re-render.
 *
 * `waitForSettled` rather than equal samples: on a re-filter the tick is first placed at
 * its previous angle (`renderTick` in itemRingFigure.js) before the turn transition
 * starts, and equal samples could take that stale angle for a settled one.
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<string|null>}
 */
async function settledTransform(locator) {
    await waitForSettled(locator.page());
    return locator.getAttribute('transform');
}

test.describe('MA overview – item ring reacts to competence-level filter', () => {
    test('clicking a competence-level segment updates the item ring grid', async ({ page }) => {
        await gotoApp(page, '/ma/#overview');

        await page
            .locator(`${ITEM_RING} svg.chart-root`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
        const segments = page.locator(`${COMPETENCE_LEVEL_CHART} .bar-segment`);
        await segments.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

        // A ring renders an active student filter as one tick group, whose rotor is
        // rotated by (successRate / 100) * 360 degrees (renderTick in itemRingFigure.js);
        // with no filter there is none. A markup comparison would
        // pass for a re-render that dropped the filter or applied another level.
        const ticks = page.locator(`${ITEM_RING} .selected-student-tick`);
        await expect(ticks).toHaveCount(0);
        // The legend keys the selection's tick and figure only while they are drawn.
        const selectionKey = page.locator(`${ITEM_RING} .item-ring-legend-selection`);
        await expect(selectionKey).toHaveCount(0);

        await segments.first().click();

        await expect(ticks.first()).toBeVisible();
        await expect(selectionKey).toHaveCount(1);
        const rotor = ticks.first().locator('.item-ring-tick-rotor');
        const firstLevelAngle = await settledTransform(rotor);
        expect(firstLevelAngle).toMatch(/rotate\(/);

        // A different level re-derives the cohort: the tick angle is the filtered
        // students' success rate, so it cannot stay put. Fails if
        // setCompetenceLevelFilter ignores the level it is given.
        await segments.nth(1).click();
        await expect(ticks.first()).toBeVisible();
        expect(await settledTransform(rotor)).not.toBe(firstLevelAngle);
    });
});
