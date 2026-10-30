/**
 * The competence overview chart's x-axis: the band scales both levels of slots sit on,
 * the fitted Fach/Domäne labels under the plot, joined by Fach/Domäne, and the
 * measurements that reserve their space (and the group labels' above it) before the plot
 * is laid out. The axis group and its reserve are the ones both competence charts share
 * (`../shared/competenceAxes.js`). Free functions over the renderer's measurement hooks.
 */

import {
    animate,
    fadeOutAndRemove,
    takeBack,
} from '../../../../../common/charts/motionPreference.js';
import {
    BAND_LABEL_GAP_PX,
    appendFittedLabelLines,
    measureLabelBlockHeight,
    splitLabelLines,
} from '../../../../../common/charts/chartLabelFit.js';
import { categoryAxisReserve } from '../shared/competenceAxes.js';
import { barTopLabelReserve } from '../shared/competenceBar.js';
import { categoryLabelBaseline } from '../../../../../common/charts/chartAxisUtils.js';
import * as d3 from 'd3';
import { fontWeightToken } from '../../../../../common/utils/fontTokens.js';
import { SHORT_LABEL_PREFIX_BY_ROLE } from '../../../../../common/domain/comparisonGroupLabels.js';

/**
 * Floor on the gap between two neighbouring group labels. It binds only at the chart's
 * minimum (scrolling) width, and is small so short names do not widen the chart past its
 * container.
 */
export const OVERVIEW_GROUP_LABEL_GAP_PX = 4;
/** Narrowest a sub-band may get before its bar stops being readable. */
const OVERVIEW_MIN_SUB_SLOT_PX = 14;
/**
 * The band padding of the Fach/Domäne slots, and between the bar slots inside each: the
 * bars of one slot stay at least 4 px apart even at the narrowest sub-slot (0.3 × 14 px).
 * The outer bars keep only a sliver (0.05) from their slot's ends.
 */
const BAND_PADDING = Object.freeze({
    SLOT_RATIO: 0.15,
    BAR_INNER_RATIO: 0.3,
    BAR_OUTER_RATIO: 0.05,
});

/**
 * The overview's two band scales: one slot per Fach/Domäne across the plot, and inside
 * each one slot per bar. The render, every legend toggle and the width solver all build
 * them here, so they cannot drift apart.
 * @param {string[]} domainKeys - The Fach/Domäne slots, in order.
 * @param {string[]} barKeys - The bar slots inside each, in order.
 * @param {number} width - Plot width in px.
 * @returns {{x: d3.ScaleBand<string>, sub: d3.ScaleBand<string>}} The outer and inner scale.
 */
export function overviewBandScales(domainKeys, barKeys, width) {
    const x = d3.scaleBand().domain(domainKeys).range([0, width]).padding(BAND_PADDING.SLOT_RATIO);
    const sub = d3
        .scaleBand()
        .domain(barKeys)
        .range([0, x.bandwidth()])
        .paddingInner(BAND_PADDING.BAR_INNER_RATIO)
        .paddingOuter(BAND_PADDING.BAR_OUTER_RATIO);
    return { x, sub };
}

/**
 * Height the Fach/Domäne labels below the x-axis need: the block of their split lines,
 * whatever slot width they end up fitted to.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart
 * @param {string[]} domainLabels - The labels, one per slot.
 * @returns {number} Reserved height in px.
 */
export function measureOverviewBottomAxisSpace(chart, domainLabels) {
    return categoryAxisReserve(measureLabelBlockHeight(chart, [...new Set(domainLabels)]));
}

/**
 * Height the labels above the bars need. Group names wrap over up to two lines
 * (`splitLabelLines`); the drawn lines are what is measured, so reserve and render agree.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart
 * @param {string[]} groupNames
 * @returns {number} Reserved height in px.
 */
export function measureOverviewTopAxisSpace(chart, groupNames) {
    const fixedTags = [SHORT_LABEL_PREFIX_BY_ROLE.state, SHORT_LABEL_PREFIX_BY_ROLE.school];
    return barTopLabelReserve(chart, [...fixedTags, ...(groupNames || [])]);
}

/**
 * Narrowest chart (plot) width at which every sub-band still fits its group
 * label's longest line, in px.
 *
 * Solved through the same two band scales the render builds: a band scale is
 * linear in its range, so unit-range scales give the inner step each pixel
 * of chart width buys, and the required width is the label slot divided by
 * that rate.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart
 * @param {number} domainCount - Fach/Domäne slots on the outer scale.
 * @param {number} barTypeCount - Bars per slot (tracks + school + groups).
 * @param {string[]} groupLabels - The group names, whose longest split line sets the slot.
 * @returns {number} Required chart width in px; `0` when there is nothing to fit.
 */
export function computeRequiredOverviewChartWidth(chart, domainCount, barTypeCount, groupLabels) {
    if (!domainCount || !barTypeCount) return 0;

    const widestLine = chart.measureTexts((groupLabels || []).flatMap(splitLabelLines), {
        fontWeight: fontWeightToken('bold'),
    }).maxWidth;
    const slot = Math.max(OVERVIEW_MIN_SUB_SLOT_PX, widestLine + OVERVIEW_GROUP_LABEL_GAP_PX);

    const { sub } = overviewBandScales(
        d3.range(domainCount).map(String),
        d3.range(barTypeCount).map(String),
        1,
    );
    return sub.step() > 0 ? slot / sub.step() : 0;
}

/** The transition the Fach/Domäne labels fade in and out in. */
const AXIS_LABEL_TRANSITION = 'overview-axis-label';

/**
 * Draw one label per visible Fach/Domäne under its slot, split over up to two lines and
 * fitted to the slot (the chartLabelFit policy), joined by Fach/Domäne: a drawn label is
 * written at its new place, a new one fades in over half of `durationMs`, one whose Fach
 * was hidden fades out. Without a fade (or under reduced motion) a new label is drawn
 * opaque, since nothing would bring a transparent start back.
 * @param {import('./competenceOverviewRenderer.js').CompetenceOverviewRenderer} chart
 * @param {d3.Selection<SVGGElement, unknown, any, any>} xAxisGroup
 * @param {import('./competenceOverviewData.js').CompetenceOverviewRow[]} rows - The visible Fächer/Domänen, in order.
 * @param {d3.ScaleBand<string>} xScale - The band scale over them.
 * @param {number} durationMs - The draw's transition length.
 */
export function renderOverviewAxisLabels(chart, xAxisGroup, rows, xScale, durationMs) {
    const slot = Math.max(0, xScale.bandwidth() - BAND_LABEL_GAP_PX);
    const y = categoryLabelBaseline(chart);
    const fadeMs = durationMs / 2;
    /** @type {(row: import('./competenceOverviewData.js').CompetenceOverviewRow) => number} */
    const centerOf = (row) => /** @type {number} */ (xScale(row.domain)) + xScale.bandwidth() / 2;

    /** @type {d3.Selection<SVGTextElement, import('./competenceOverviewData.js').CompetenceOverviewRow, SVGGElement, unknown>} */
    const drawn = xAxisGroup.selectChildren('text.overview-axis-label');
    drawn
        .data(rows, (row) => row.domain)
        .join(
            (enter) => {
                const labels = enter
                    .append('text')
                    .attr('class', 'overview-axis-label axis-tick-label')
                    .attr('x', centerOf)
                    .attr('y', y)
                    .attr('text-anchor', 'middle');
                labels.each(function (row) {
                    appendFittedLabelLines(chart, d3.select(this), row.displayDomain, {
                        x: centerOf(row),
                        y,
                        slotPx: slot,
                        stack: 'down',
                    });
                });
                animate(labels.style('opacity', 0), {
                    durationMs: fadeMs,
                    name: AXIS_LABEL_TRANSITION,
                }).style('opacity', 1);
                return labels;
            },
            (update) => {
                // A label caught fading out stays.
                takeBack(update, AXIS_LABEL_TRANSITION)
                    .style('opacity', 1)
                    .attr('x', centerOf)
                    .attr('y', y)
                    .each(function (row) {
                        appendFittedLabelLines(
                            chart,
                            d3.select(this).text(null),
                            row.displayDomain,
                            { x: centerOf(row), y, slotPx: slot, stack: 'down' },
                        );
                    });
                return update;
            },
            (exit) => fadeOutAndRemove(exit, AXIS_LABEL_TRANSITION, fadeMs),
        )
        .order();
}
