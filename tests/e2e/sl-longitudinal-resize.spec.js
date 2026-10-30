/**
 * E2E test: the SL Längsschnitt view survives a live window resize.
 *
 * No other spec resizes a mounted SL view. Längsschnitt has three resize-observed chart
 * hosts in one flex row (`.longitudinal-charts-row`) that reflows from a row of
 * equal-width cards into a column of fixed-height ones at `--stacked-layout` (1280px), over
 * `overflow: auto` bodies; every crossing re-renders all three charts at once.
 *
 * The oracle is the persistent toast: a failed resize redraw that escapes its chart
 * surfaces as the global „Ein unerwarteter Fehler ist aufgetreten" alert. Geometry is
 * checked by round-trip: back at the starting width the three charts are exactly the
 * size they were, which a re-render that measured a stale or half-collapsed box would
 * not reproduce.
 */

import { test, expect } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT_MS } from './support/app.js';
import { assertNoPageErrors, collectErrors } from './support/pageErrors.js';
import { waitForSettled } from './support/settle.js';

const VIEWPORT_HEIGHT_PX = 900;
/** Either side of the 1280px `--stacked-layout` breakpoint (breakpoints.css). */
const WIDE_PX = 1400;
const NARROW_PX = 1120;

const CARD_BODY = '.longitudinal-chart-body';
const CHART_SVG = `${CARD_BODY} svg.chart-root`;
const PERSISTENT_TOAST = '.toast--persistent';

/**
 * Every shown chart's rendered box, rounded to px, once the page has settled: charts
 * animate and web fonts relayout late, so a single sample is not a baseline. The card
 * the chart type hides (the box plot in lines mode, the survey cards in boxplot mode)
 * has no box.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{width: number, height: number}>>}
 */
async function settledChartBoxes(page) {
    await waitForSettled(page);
    return page.evaluate(
        (selector) =>
            [...document.querySelectorAll(selector)]
                .filter((node) => node.getClientRects().length > 0)
                .map((node) => {
                    const { width, height } = node.getBoundingClientRect();
                    return { width: Math.round(width), height: Math.round(height) };
                }),
        CHART_SVG,
    );
}

/**
 * Drag the window across the breakpoint the way a reader does: many small steps.
 * @param {import('@playwright/test').Page} page
 * @param {number} from - The starting width, in px.
 * @param {number} to - The final width, in px.
 */
async function dragWidth(page, from, to) {
    const step = to > from ? 12 : -12;
    for (let width = from; step > 0 ? width <= to : width >= to; width += step) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT_PX });
    }
    await page.setViewportSize({ width: to, height: VIEWPORT_HEIGHT_PX });
}

/**
 * Nothing announced a failure: no persistent toast, no uncaught exception.
 * @param {import('@playwright/test').Page} page
 * @param {import('./support/pageErrors.js').PageErrors} errors - From `collectErrors`.
 */
async function expectNoFailure(page, errors) {
    await expect(page.locator(PERSISTENT_TOAST)).toHaveCount(0);
    assertNoPageErrors(errors.pageErrors);
}

test.describe('SL Längsschnitt under a live resize', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: WIDE_PX, height: VIEWPORT_HEIGHT_PX });
        await gotoApp(page, '/sl/#longitudinal');
        // All three shown charts, not just the first: a baseline sampled before the last
        // one mounts would hold fewer boxes than every later sample.
        await expect
            .poll(
                () =>
                    page
                        .locator(CHART_SVG)
                        .evaluateAll(
                            (nodes) =>
                                nodes.filter((node) => node.getClientRects().length > 0).length,
                        ),
                { timeout: LOAD_TIMEOUT_MS },
            )
            .toBe(3);
    });

    test('dragging across the 1280px breakpoint raises no failure and restores the layout', async ({
        page,
    }) => {
        const errors = collectErrors(page);
        const baseline = await settledChartBoxes(page);
        expect(baseline).toHaveLength(3);

        for (let round = 0; round < 2; round++) {
            await dragWidth(page, WIDE_PX, NARROW_PX);
            await settledChartBoxes(page);
            await dragWidth(page, NARROW_PX, WIDE_PX);
            await settledChartBoxes(page);
        }

        await expectNoFailure(page, errors);

        expect(await settledChartBoxes(page)).toEqual(baseline);
    });

    test('a boxplot round trip with the stacked toggle survives a resize', async ({ page }) => {
        const errors = collectErrors(page);
        await settledChartBoxes(page);

        /**
         * @param {string} value - The mode button's `data-mode`.
         * @returns {import('@playwright/test').Locator}
         */
        const mode = (value) => page.locator(`button[data-mode="${value}"]`);

        // Stacked is chosen in lines mode: box-plot mode hides the toggle, since the
        // box plot has nothing to stack.
        await mode('stacked').click();
        await mode('boxplot').click();
        await page.locator(`${CARD_BODY} .y-axis-teaching`).waitFor({ timeout: LOAD_TIMEOUT_MS });
        await expect(page.locator('#sl-shared-header-view-toggle')).toBeHidden();

        // The view is resumed with boxplot still active, so the self-efficacy card
        // comes back hidden, holding the stacked mode.
        await clickNav(page, '#summaryViewButton');
        await clickNav(page, '#longitudinalViewButton');
        await page.locator(`${CARD_BODY} .y-axis-teaching`).waitFor({ timeout: LOAD_TIMEOUT_MS });

        await dragWidth(page, WIDE_PX, NARROW_PX);
        await dragWidth(page, NARROW_PX, WIDE_PX);

        await mode('lines').click();
        const settled = await settledChartBoxes(page);
        expect(settled).toHaveLength(3);
        // The card hidden through the box-plot round trip comes back stacked.
        await expect(page.locator('#sl-long-self-efficacy .area').first()).toBeVisible();

        await expectNoFailure(page, errors);
    });
});
