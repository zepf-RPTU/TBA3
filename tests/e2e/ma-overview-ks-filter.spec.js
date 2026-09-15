/**
 * E2E test: MA overview task-ring grid reacts to the KS-level filter.
 *
 * Regression guard for moving the KS-level filter off a view-side data push
 * (`taskRingModule.update({ selectedStudents })`): the view wires the KS chart's
 * `onLevelSelected` to the grid's `setKsLevelFilter` verb, whose controller
 * resolves the student slice from the chart's immutable studentArray and
 * applies it reactively via setState (highlighting / success-rate tick).
 *
 * Clicking a KS-level segment in the ksDistribution chart must update the task
 * ring grid (its rendered SVG changes).
 */

import { test, expect, describe } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const UPDATE_TIMEOUT = 5_000;

const TASK_RING = '#ma-overview-taskRing';
const KS_CHART = '#ma-overview-ksDistribution';

/**
 * Read a tick's `transform` once it has stopped moving.
 *
 * The tick animates into position, so a single read — or an `expect.poll` that
 * stops at the first differing sample — compares transient values and would
 * report "the angle changed" for any re-render at all, which is precisely the
 * weakness this spec is meant to have shed. Only the settled angle is evidence.
 *
 * Three consecutive equal samples, not two — same reason as the geometry settle in
 * `sl-competency.spec.js`. On a re-filter the tick is removed and re-appended at
 * its *previous* angle (`#animateTickRotation` passes `initialAngleDeg: oldDeg`)
 * before the rotation transition starts, so two samples taken across that gap can
 * both read the stale angle and be mistaken for a settled value.
 *
 * @param {import('playwright').Locator} locator
 * @returns {Promise<string|null>}
 */
async function settledTransform(locator) {
    let previous = null;
    let stable = 0;
    for (let i = 0; i < 50; i++) {
        const current = await locator.getAttribute('transform');
        stable = current !== null && current === previous ? stable + 1 : 0;
        if (stable >= 2) return current;
        previous = current;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Tick transform never settled (last value: ${previous})`);
}

describe('MA overview – task ring reacts to KS-level filter (event-sync)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, '/ma/');
    });

    test('clicking a KS-level segment updates the task ring grid', async ({ page }) => {
        await page.locator('#overviewViewButton').click();

        // Both charts render
        await page
            .locator(`${TASK_RING} svg`)
            .first()
            .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
        const segments = page.locator(`${KS_CHART} .bar-segment`);
        await segments.first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

        // The selected-student tick is how a ring renders an active student filter:
        // one tick group per ring, rotated by (successRate / 100) * 360 degrees
        // (renderStudentTick in taskRingFigure.js). With no filter there is none.
        //
        // Asserting on the tick rather than on "the markup changed" is deliberate —
        // a re-render that dropped the filter, or applied a level other than the one
        // clicked, would still change the markup and so would still pass the weaker
        // check this replaced.
        const ticks = page.locator(`${TASK_RING} .selected-student-tick`);
        await expect(ticks).toHaveCount(0);

        // Click a KS-level segment — the view forwards it to the task ring grid's
        // setKsLevelFilter verb (setState).
        await segments.first().click();

        // The filter must actually reach the rings.
        await expect(ticks.first()).toBeVisible({ timeout: UPDATE_TIMEOUT });
        const firstLevelAngle = await settledTransform(ticks.first());
        expect(firstLevelAngle).toMatch(/rotate\(/);

        // Selecting a *different* level must re-derive the cohort: the tick angle is
        // the filtered students' success rate, so it cannot stay put. This is the
        // assertion that fails if handleKsLevelFilter ignores the level it is given.
        await segments.nth(1).click();
        await expect(ticks.first()).toBeVisible({ timeout: UPDATE_TIMEOUT });
        expect(await settledTransform(ticks.first())).not.toBe(firstLevelAngle);
    });
});
