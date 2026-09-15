/**
 * E2E test: the SL Längsschnitt view survives a live window resize.
 *
 * WHY this view, and why a *live* resize. `routed-view-smoke.spec.js` sets the
 * viewport before it navigates, so no spec in the suite ever resized a mounted
 * SL view. Längsschnitt is the shape that makes a resize expensive: three
 * resize-observed chart hosts in one flex row (`.longitudinal-charts-row`) that
 * reflows from a row of equal-width cards into a column of fixed-height ones at
 * `max-width: 1280px`, over `overflow: auto` bodies. Every crossing re-renders
 * all three charts at once.
 *
 * The oracle is the persistent toast, not the console. A failed resize redraw
 * used to escape its chart — `ChartRenderer._render()` is async, and the shared
 * resize service only guarded synchronous throws — and surfaced as the global
 * „Ein unerwarteter Fehler ist aufgetreten" alert, which is what a reader
 * actually sees. Geometry is checked by round-trip: back at the starting width
 * the three charts must be exactly the size they were, which a re-render that
 * measured a stale or half-collapsed box would not reproduce.
 */

import { test, expect, describe } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';
import { collectErrors } from './support/pageErrors.js';

const HEIGHT = 900;
/** Either side of the 1280px breakpoint in slLongitudinalViewModule.css. */
const WIDE = 1400;
const NARROW = 1120;

const CARD_BODY = '.longitudinal-chart-body';
const CHART_SVG = `${CARD_BODY} > svg`;
const PERSISTENT_TOAST = '.toast--persistent';

/** Every chart's rendered box, rounded to the pixel the reader sees. */
async function chartBoxes(page) {
    return page.$$eval(CHART_SVG, (nodes) =>
        nodes.map((node) => {
            const { width, height } = node.getBoundingClientRect();
            return { width: Math.round(width), height: Math.round(height) };
        }),
    );
}

/**
 * The chart geometry once it has stopped moving: charts animate and web fonts
 * relayout late, so a single sample is not a baseline.
 */
async function settledChartBoxes(page) {
    await page.evaluate(() => document.fonts.ready);
    let previous = null;
    let stable = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
        const current = JSON.stringify(await chartBoxes(page));
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        if (stable >= 2 && JSON.parse(current).length === 3) return JSON.parse(current);
        await page.waitForTimeout(100);
    }
    throw new Error(`Chart geometry never settled; last sample: ${previous}`);
}

/** Drag the window across the breakpoint the way a reader does: many small steps. */
async function dragWidth(page, from, to) {
    const step = to > from ? 12 : -12;
    for (let width = from; step > 0 ? width <= to : width >= to; width += step) {
        await page.setViewportSize({ width, height: HEIGHT });
    }
    await page.setViewportSize({ width: to, height: HEIGHT });
}

describe('SL Längsschnitt under a live resize', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: WIDE, height: HEIGHT });
        await gotoApp(page, '/sl/#longitudinal');
        await page.locator(CHART_SVG).first().waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    });

    test('dragging across the 1280px breakpoint raises no failure and restores the layout', async ({
        page,
    }) => {
        const errors = collectErrors(page);
        const baseline = await settledChartBoxes(page);
        expect(baseline).toHaveLength(3);

        for (let round = 0; round < 2; round++) {
            await dragWidth(page, WIDE, NARROW);
            await settledChartBoxes(page);
            await dragWidth(page, NARROW, WIDE);
            await settledChartBoxes(page);
        }

        // The reader's oracle: nothing announced a failure.
        await expect(page.locator(PERSISTENT_TOAST)).toHaveCount(0);
        expect(
            errors.pageErrors,
            `Unexpected page errors:\n${errors.pageErrors.join('\n')}`,
        ).toEqual([]);

        // Round-trip: same width, same charts, to the pixel.
        expect(await settledChartBoxes(page)).toEqual(baseline);
    });

    test('a Bereich switch followed by a resize keeps every year on its own tick', async ({
        page,
    }) => {
        const errors = collectErrors(page);
        await settledChartBoxes(page);

        const select = page.locator('select[id$="domain-select-select"]');
        const values = await select
            .locator('option')
            .evaluateAll((options) =>
                options.map((option) => /** @type {HTMLOptionElement} */ (option).value),
            );
        expect(values.length).toBeGreaterThan(1);

        // Switch Bereich — the charts update in place — then resize, which is a
        // full rebuild off the cached derivations. The committed fixture spans the
        // same years in every Bereich, so the stale-year-cache regression itself is
        // pinned by the unit test; what this guards is that the pair still lands a
        // complete, well-formed chart.
        await select.selectOption(values[values.length - 1]);
        await settledChartBoxes(page);
        await dragWidth(page, WIDE, NARROW);
        await dragWidth(page, NARROW, WIDE);
        await settledChartBoxes(page);

        // No series collapsed onto the y axis: every marker sits clear of x = 0
        // in its own chart's plot coordinates.  (A year the x scale does not know
        // falls through `xScale(...) ?? 0` and pins its marker to the left edge.)
        const leftmostMarkers = await page.$$eval(`${CARD_BODY} .dot`, (nodes) =>
            nodes
                .map((node) => {
                    const match = /translate\(([-\d.]+),/.exec(
                        node.getAttribute('transform') ?? '',
                    );
                    return match ? Number(match[1]) : null;
                })
                .filter((x) => x !== null),
        );
        expect(leftmostMarkers.length).toBeGreaterThan(0);
        expect(Math.min(...leftmostMarkers)).toBeGreaterThan(0);

        await expect(page.locator(PERSISTENT_TOAST)).toHaveCount(0);
        expect(
            errors.pageErrors,
            `Unexpected page errors:\n${errors.pageErrors.join('\n')}`,
        ).toEqual([]);
    });

    test('a boxplot round trip with the stacked toggle survives a resize', async ({ page }) => {
        const errors = collectErrors(page);
        await settledChartBoxes(page);

        const mode = (value) => page.locator(`button[data-mode="${value}"]`);

        await mode('boxplot').click();
        await page.locator(`${CARD_BODY} .y-axis-teaching`).waitFor({ timeout: LOAD_TIMEOUT });

        // Leave and come back: the view is resumed with boxplot still active, so
        // the self-efficacy card comes back hidden and the shared "gestapelt"
        // toggle reaches a chart the reader cannot see.
        await clickNav(page, '#summaryViewButton');
        await clickNav(page, '#longitudinalViewButton');
        await page.locator(`${CARD_BODY} .y-axis-teaching`).waitFor({ timeout: LOAD_TIMEOUT });

        await mode('stacked').click();
        await dragWidth(page, WIDE, NARROW);
        await dragWidth(page, NARROW, WIDE);

        await mode('parallel').click();
        const settled = await settledChartBoxes(page);
        expect(settled).toHaveLength(3);
        // The hidden card honours the mode it was switched to while it was hidden.
        await expect(page.locator('#sl-long-self-efficacy .area').first()).toBeVisible();

        await expect(page.locator(PERSISTENT_TOAST)).toHaveCount(0);
        expect(
            errors.pageErrors,
            `Unexpected page errors:\n${errors.pageErrors.join('\n')}`,
        ).toEqual([]);
    });
});
