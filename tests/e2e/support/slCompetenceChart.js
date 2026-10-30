/**
 * Shared helpers for the SL competence-chart spec (sl-competence.spec.js).
 */

import { expect } from './test.js';
import { LOAD_TIMEOUT_MS, gotoApp, parkPointer } from './app.js';
import { selectMode } from './modes.js';
import { waitForSettled } from './settle.js';

export const MATRIX_CHART = '#sl-matrix-chart';
export const SUMMARY_ROW = '.sl-summary-view .summary-row-card';
export const COMPETENCE_LEVEL_SEGMENT = '.bar-segment.competence-level';
export const COMPETENCE_CARD = '.chart-thumbnail-card';
export const OVERLAY = 'dialog[open]:has(> tba-sl-detail-overlay)';

/**
 * Open SL on the Details view's charts grid, straight from its hash route.
 * @param {import('@playwright/test').Page} page
 * @param {string} [path] - The SL page path, e.g. `/sl/?scope=schools/sl`.
 */
export async function gotoDetailsCharts(page, path = '/sl/') {
    await gotoApp(page, `${path}#details`);
    await page.waitForSelector(COMPETENCE_CARD, { timeout: LOAD_TIMEOUT_MS });
}

/**
 * Open SL on the Details view and there the detail overlay of the first thumbnail card whose
 * preview is a competence chart (which skips the Selbstwirksamkeit card).
 * @param {import('@playwright/test').Page} page
 * @param {string} [path] - The SL page path, e.g. `/sl/?scope=schools/sl`.
 * @returns {Promise<import('@playwright/test').Locator>} The overlay.
 */
export async function openCompetenceOverlay(page, path = '/sl/') {
    await gotoDetailsCharts(page, path);
    await page
        .locator(COMPETENCE_CARD, { has: page.locator(COMPETENCE_LEVEL_SEGMENT) })
        .first()
        .click();
    return page.locator(OVERLAY);
}

/**
 * On the Details view's charts grid, switch to the by-groups cards and open the detail overlay
 * of the first one whose preview is a competence chart: the school card.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} The overlay.
 */
export async function openGroupsCardOverlay(page) {
    await selectMode(page, 'by_groups');
    // Scoped to the by-groups grid: the hidden by-subjects grid keeps its drawn cards.
    await page
        .locator("[data-details-section='charts:by_groups']")
        .locator(COMPETENCE_CARD, { has: page.locator(COMPETENCE_LEVEL_SEGMENT) })
        .first()
        .click();
    return page.locator(OVERLAY);
}

/**
 * Open SL on the Gesamtbild view and wait for its first drawn competence-level segment.
 * Only the Schulschnitt starts on, so the first segment in the DOM may be a hidden one.
 * @param {import('@playwright/test').Page} page
 */
export async function gotoMatrix(page) {
    await gotoApp(page, '/sl/#matrix');
    await page
        .locator(MATRIX_CHART)
        .locator(COMPETENCE_LEVEL_SEGMENT)
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
}

/** The headings of the SL legend blocks that are not a Fach's Domänen. */
const FIXED_LEGEND_SECTIONS = ['Fächer', 'Vergleich', 'Lerngruppen', 'Kompetenzstufen'];

/**
 * A heading locator matching one of the given legend headings exactly.
 * @param {import('@playwright/test').Locator} scope - Where the legend sits.
 * @param {string[]} titles
 * @returns {import('@playwright/test').Locator}
 */
function legendHeading(scope, titles) {
    return scope.page().locator('.legend-section-title', {
        hasText: new RegExp(`^\\s*(${titles.join('|')})\\s*$`),
    });
}

/**
 * The pills of a legend block, found by its heading.
 * @param {import('@playwright/test').Locator} scope - Where the legend sits: a chart, the overlay, the page body.
 * @param {string} title - The block's heading, e.g. `Vergleich`.
 * @returns {import('@playwright/test').Locator} Its pills, in order.
 */
export function legendSectionPills(scope, title) {
    return scope
        .locator('.legend-section')
        .filter({ has: legendHeading(scope, [title]) })
        .locator('.legend-pill');
}

/**
 * The Domäne pills of a detail chart's legend: the pills of every block headed by
 * something other than the fixed blocks (a Fach, or the Bereiche).
 * @param {import('@playwright/test').Locator} scope - Where the legend sits.
 * @returns {import('@playwright/test').Locator} The pills, in order.
 */
export function domainLegendPills(scope) {
    return scope
        .locator('.legend-section')
        .filter({ hasNot: legendHeading(scope, FIXED_LEGEND_SECTIONS) })
        .locator('.legend-pill');
}

/**
 * Move the pointer off any glossary term and wait for its popup to close.
 *
 * The `KOMPETENZSTUFEN` legend heading is a glossary term whose popup anchors below
 * it, over the competence-level pills, with `pointer-events: auto`. A pointer that
 * crosses the heading on its way to a pill leaves the popup covering the click target,
 * and Playwright retries the click until it times out.
 * @param {import('@playwright/test').Page} page
 */
async function dismissGlossaryPopup(page) {
    await parkPointer(page);
    await expect(page.locator('.glossary-popup:popover-open')).toHaveCount(0);
}

/**
 * Click a legend pill with the glossary popup out of the way (see `dismissGlossaryPopup`).
 * @param {import('@playwright/test').Locator} pill
 */
export async function clickLegendPill(pill) {
    await dismissGlossaryPopup(pill.page());
    await pill.click();
}

/**
 * Rendered size of every segment. Hiding a Kompetenzstufe takes its segments out of
 * every bar, while hiding a bar only fades it, so the segment count is not the signal;
 * the sizes are.
 *
 * Both dimensions, because the charts stack along different axes: the Gesamtbild
 * distribution is vertical (fixed 24px width), the overlay charts are horizontal.
 * @param {import('@playwright/test').Locator} segments
 * @returns {Promise<number[][]>} Each segment's `[width, height]`, rounded to px.
 */
export async function segmentSizes(segments) {
    return segments.evaluateAll((els) =>
        els.map((el) => {
            const { width, height } = el.getBoundingClientRect();
            return [Math.round(width), Math.round(height)];
        }),
    );
}

/**
 * Assert that a legend pill hides (or, starting off, shows) its own series, and
 * restores it.
 *
 * A markup comparison passes for any re-render, including one that drops the wrong
 * series or rebuilds the chart unchanged. Geometry that changes and then returns to
 * exactly its starting value pins the toggle to the series it names.
 * @param {import('@playwright/test').Locator} pill
 * @param {import('@playwright/test').Locator} segments
 * @param {{startsPressed?: boolean}} [options] - `startsPressed: false` for a pill that starts off.
 */
export async function expectPillHidesAndRestores(pill, segments, { startsPressed = true } = {}) {
    const page = pill.page();
    const sizes = () => segmentSizes(segments);
    const start = String(startsPressed);
    const toggled = String(!startsPressed);

    await expect(pill).toHaveAttribute('aria-pressed', start);
    expect(await segments.count()).toBeGreaterThan(0);
    await waitForSettled(page);
    const before = await sizes();

    await clickLegendPill(pill);
    await expect(pill).toHaveAttribute('aria-pressed', toggled);
    await expect.poll(sizes).not.toEqual(before);

    await clickLegendPill(pill);
    await expect(pill).toHaveAttribute('aria-pressed', start);

    // Exact, segment for segment: the initial render and the toggle path inset each
    // segment by `SEGMENT_GAP_PX` through the same computeStackedBarRects, and this keeps
    // the two paths from drifting apart.
    // Polled: the restoring redraw can start after the page first looks still.
    await expect.poll(sizes).toEqual(before);
}
