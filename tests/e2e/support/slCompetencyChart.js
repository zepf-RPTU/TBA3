/**
 * Shared helpers for the SL competency-chart spec (sl-competency.spec.js).
 */

import { expect } from './test.js';
import { LOAD_TIMEOUT } from './app.js';

export const UPDATE_TIMEOUT = 5_000;

export const WELCOME_CHART = '#sl-welcome-chart';
export const SUMMARY_ROW = '.sl-summary-view .summary-row-card';
export const KS_SEGMENT = '.bar-segment.competency-level';
export const COMPETENCY_CARD = '.chart-thumbnail-card';
export const OVERLAY = '.sl-detail-overlay.visible';

/**
 * Navigate from the (already-settled) summary view to the overview charts grid.
 * The app rejects a view switch while it is still transitioning into the default
 * view, so callers must ensure the summary charts have rendered first.
 */
export async function gotoOverviewCharts(page) {
    await page.locator('#overviewViewButton').click();
    await page.waitForSelector(COMPETENCY_CARD, { timeout: LOAD_TIMEOUT });
}

/** Welcome (welcome) is the alternative landing view — reachable only via its nav button. */
export async function gotoWelcome(page) {
    await page.locator('#welcomeViewButton').click();
    await page
        .locator(`${WELCOME_CHART} svg`)
        .first()
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

/**
 * Move the pointer off any glossary term and wait for its popup to close.
 *
 * The `KOMPETENZSTUFEN` legend heading is a glossary term whose popup anchors
 * `below` it — i.e. directly over the KS pills, with `pointer-events: auto`. A
 * pointer that crosses the heading on its way to a pill leaves the popup
 * covering the click target, and Playwright then retries the click until it
 * times out. Parking the pointer in the corner lets the popup's hover-out grace
 * timer run and clears the overlay before the real click.
 *
 * @param {import('playwright').Page} page
 */
export async function dismissGlossaryPopup(page) {
    await page.mouse.move(0, 0);
    await expect(page.locator('.glossary-popup.visible')).toHaveCount(0, {
        timeout: UPDATE_TIMEOUT,
    });
}

/**
 * Rendered size of every segment. Hiding a series does not remove its segment
 * nodes — the renderer keeps them and re-sizes the stack — so segment *count* is
 * not the signal. The rendered geometry is: the vector of segment sizes is what a
 * viewer actually sees change.
 *
 * Both dimensions are captured because the charts stack along different axes:
 * the welcome distribution is vertical (fixed 24px width, height carries the
 * value), the overlay charts are horizontal.
 * @param {import('playwright').Locator} segments
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
 * Wait for the segment geometry to stop moving and return its signature.
 *
 * Segments animate into place, so a baseline read too early captures a
 * mid-transition size and a later comparison never matches it.
 *
 * Two consecutive equal samples is not enough. Under a full-suite run the
 * chart can relayout *after* the transition ends — web fonts finishing late
 * change the axis/label metrics and shift the plot area by a few px — which
 * produced a ~1-in-3 "drifted by 6px" failure that never reproduced in
 * isolation (30/30 clean). So: settle the fonts first, then require three
 * consecutive equal samples rather than two.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} segments
 */
export async function settledSegmentSignature(page, segments) {
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
    let previous = null;
    let stable = 0;
    for (let i = 0; i < 60; i++) {
        const current = JSON.stringify(await segmentSizes(segments));
        stable = current !== null && current === previous ? stable + 1 : 0;
        if (stable >= 2) return current;
        previous = current;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Segment geometry never settled');
}

/**
 * Assert that a legend pill actually hides its own series, and restores it.
 *
 * The round-trip is the point. Asserting only that the markup differs after a
 * click — which is what this spec used to do — passes for *any* re-render,
 * including one that drops the wrong series or rebuilds the chart unchanged.
 * Requiring the rendered geometry to change and then return to exactly its
 * starting value pins the toggle to the series it names.
 *
 * @param {import('playwright').Locator} pill
 * @param {import('playwright').Locator} segments
 */
export async function expectPillHidesAndRestores(pill, segments) {
    const sizes = () => segmentSizes(segments);
    const sizeSignature = async () => JSON.stringify(await sizes());
    const settledSignature = () => settledSegmentSignature(pill.page(), segments);

    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(await segments.count()).toBeGreaterThan(0);
    await settledSignature();
    const before = await sizes();

    const beforeSignature = JSON.stringify(before);
    await dismissGlossaryPopup(pill.page());
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'false', { timeout: UPDATE_TIMEOUT });
    await expect.poll(sizeSignature, { timeout: UPDATE_TIMEOUT }).not.toBe(beforeSignature);

    await dismissGlossaryPopup(pill.page());
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'true', { timeout: UPDATE_TIMEOUT });
    await settledSignature();
    const after = await sizes();

    // Restored geometry must match segment-for-segment.
    //
    // Exact equality. A hide/restore round-trip used to leave every segment 2px
    // larger than the first render, because the toggle path re-stacked segments at
    // their raw scale extents while the initial render insets each one by
    // `segmentGap` (the strip of surface shown between adjacent fills). Both paths
    // now go through insetStackedSegment(), so the restore is exact — and asserting
    // it exactly is what keeps them from drifting apart again.
    expect(after).toHaveLength(before.length);
    const drift = after.map(([w, h], i) => [
        Math.abs(w - before[i][0]),
        Math.abs(h - before[i][1]),
    ]);
    const worst = Math.max(...drift.flat());
    expect(worst, `restored geometry drifted by ${worst}px`).toBe(0);
}
