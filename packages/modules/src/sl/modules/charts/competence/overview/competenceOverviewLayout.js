/**
 * Where the competence overview's marks go for the key's pills. Every draw solves the
 * band scales for the visible Fächer and bar slots (`solveOverviewLayout`), draws the
 * bars at the visible slots' width, and moves the groups and bars there
 * (`layoutOverview`): the first paint, a resize and every legend toggle alike.
 */

import { PILLS, pillShown } from '../shared/competencePills.js';
import { animate } from '../../../../../common/charts/motionPreference.js';
import { overviewBandScales, renderOverviewAxisLabels } from './competenceOverviewAxes.js';
import { isSlotShown } from './competenceOverviewLegend.js';

/** @typedef {import('./competenceOverviewData.js').CompetenceOverviewRow} CompetenceOverviewRow */
/** @typedef {import('./competenceOverviewData.js').OverviewSlot} OverviewSlot */

/**
 * What the pills leave on, and the band scales over it.
 * @typedef {object} OverviewLayout
 * @property {(row: CompetenceOverviewRow) => boolean} isRowShown - Whether a Fach/Domäne's Fach pill is on.
 * @property {(slot: OverviewSlot) => boolean} isBarShown - Whether a bar slot's pill is on.
 * @property {CompetenceOverviewRow[]} visibleRows - The shown Fächer/Domänen, in order.
 * @property {OverviewSlot[]} visibleSlots - The shown bar slots, in order.
 * @property {import('d3').ScaleBand<string>} x - The outer scale over the shown Fächer/Domänen.
 * @property {import('d3').ScaleBand<string>} sub - The inner scale over the shown bar slots.
 */

/**
 * What the render's marks sit in.
 * @typedef {object} OverviewLayoutContext
 * @property {import('d3').Selection<SVGGElement, unknown, any, any>} g - The plot group holding the bars.
 * @property {import('d3').Selection<SVGGElement, unknown, any, any>} xAxis - The category axis group the Fach labels go into.
 */

/**
 * @param {import('./competenceOverviewData.js').CompetenceOverviewData} overview
 * @param {import('../shared/competenceLegend.js').SeriesShown} isShown
 * @param {number} width - Plot width in px.
 * @returns {OverviewLayout}
 */
export function solveOverviewLayout(overview, isShown, width) {
    /** @type {(row: CompetenceOverviewRow) => boolean} */
    const isRowShown = (row) => pillShown(isShown, PILLS.subject, row.subject);
    /** @type {(slot: OverviewSlot) => boolean} */
    const isBarShown = (slot) => isSlotShown(slot, isShown);
    const visibleRows = overview.rows.filter(isRowShown);
    const visibleSlots = overview.slots.filter(isBarShown);
    const { x, sub } = overviewBandScales(
        visibleRows.map((row) => row.domain),
        visibleSlots.map((slot) => slot.key),
        width,
    );
    return { isRowShown, isBarShown, visibleRows, visibleSlots, x, sub };
}

/**
 * Lay the drawn overview out: a hidden Fach fades and then leaves the layout, the shown
 * ones and their visible bars move to their slots, and the Fach labels follow the shown
 * Fächer.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart - The renderer that owns the marks' visibility.
 * @param {OverviewLayoutContext} context
 * @param {OverviewLayout} layout
 * @param {number} durationMs - Transition length.
 */
export function layoutOverview(chart, context, layout, durationMs) {
    const { isRowShown, isBarShown, visibleRows, x, sub } = layout;

    /** @type {import('d3').Selection<SVGGElement, CompetenceOverviewRow, SVGGElement, unknown>} */
    const domainBuckets = context.g.selectChildren('.domain-group');
    chart
        .setElementVisibility(domainBuckets.filter(isRowShown), true, {
            durationMs,
            collapse: true,
        })
        .attr(
            'transform',
            (/** @type {CompetenceOverviewRow} */ row) => `translate(${x(row.domain)}, 0)`,
        );
    chart.setElementVisibility(
        domainBuckets.filter((row) => !isRowShown(row)),
        false,
        { durationMs, collapse: true },
    );

    /** @type {import('d3').Selection<SVGGElement, import('./competenceOverviewData.js').OverviewBar, SVGGElement, unknown>} */
    const bars = domainBuckets.selectChildren('.bar-slot');
    chart.setElementVisibility(bars, isBarShown, { collapse: true });
    animate(bars.filter(isBarShown), { durationMs }).attr(
        'transform',
        (bar) => `translate(${sub(bar.key)}, 0)`,
    );

    renderOverviewAxisLabels(chart, context.xAxis, visibleRows, x, durationMs);
}
