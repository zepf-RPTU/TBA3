/**
 * The competency overview chart's axes: the percentage y-axis, the wrapped Fach/Domäne
 * labels along the x-axis, and the measurements that reserve their space before the
 * plot is laid out. Free functions over the renderer's measurement hooks.
 */

import { createPercentAxis } from '../../../../../common/charts/chartAxisUtils.js';
import { getThemeColors } from '../../../../../common/services/themeService.js';
import { prefersReducedMotion } from '../../../../../common/charts/motionPreference.js';
import { MAX_LABEL_LINES, splitLabelLines } from '../../../../../common/charts/chartLabelFit.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { CHART_CONFIG, STYLE_CONFIG } from '../shared/competencyChartConstants.js';
import * as d3 from 'd3';

const OVERVIEW_X_AXIS_LABEL_Y = 20;
/**
 * Minimum breathing room between two neighbouring class labels, in px. This is
 * the floor the width computation enforces, not the typical spacing — it only
 * binds when the chart is at its minimum (scrolling) width. Kept small so a
 * short-named demo dataset does not get widened past its container for room
 * its labels never needed.
 */
export const OVERVIEW_CLASS_LABEL_GAP = 4;
/** Line height between a wrapped class label's lines, as a factor of the font size. */
export const OVERVIEW_CLASS_LABEL_LINE_HEIGHT = 1.15;
/** Narrowest a sub-band may get before its bar stops being readable, in px. */
const OVERVIEW_MIN_SUB_SLOT = 14;
const OVERVIEW_X_AXIS_LABEL_BOTTOM_BUFFER = 4;
const OVERVIEW_TOP_LABEL_BUFFER = 6;

/**
 * Append y-axis with % ticks and custom x-axis with wrapped domain labels.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {d3.Selection} g - The plot group the axes are appended to.
 * @param {any} xScale - Outer band scale, one slot per Fach/Domäne.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale.
 * @param {number} height - Plot height in px, where the x-axis sits.
 */
export function addOverviewAxes(chart, g, xScale, yScale, height) {
    const displayDomainByKey = new Map(
        chart.chartData.map((d) => [d.domain, d.displayDomain || d.domain]),
    );

    g.append('g')
        .attr('class', 'y-axis')
        .call(createPercentAxis('left', yScale, { step: 10 }));

    const xAxisGroup = g
        .append('g')
        .attr('class', 'x-axis-custom')
        .attr('transform', `translate(0, ${height})`);

    xAxisGroup
        .append('line')
        .attr('x1', 0)
        .attr('x2', xScale.range()[1])
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', getThemeColors().chrome.text)
        .attr('stroke-width', '1');

    renderOverviewAxisLabels(chart, xAxisGroup, xScale.domain(), xScale, displayDomainByKey);
}

/**
 * Append rotated y-axis label.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {d3.Selection} g - The plot group the label is appended to.
 */
export function addOverviewLabelsAndTitle(chart, g) {
    chart.renderAxisTitle(g, 'left', `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`, {
        fontWeight: 'bold',
        className: 'axis-label',
    });
}

/**
 * Height the wrapped Fach/Domäne labels below the x-axis need.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {string[]} domainLabels - The labels, one per slot.
 * @param {number} containerWidth - The container width the slots are laid out in.
 * @param {number} leftAxisSpace - What the y-axis already takes.
 * @returns {number} Reserved height in px.
 */
export function measureOverviewBottomAxisSpace(chart, domainLabels, containerWidth, leftAxisSpace) {
    if (!domainLabels?.length) return 0;

    const uniqueDomainLabels = [...new Set(domainLabels)];

    const estimatedChartWidth = Math.max(0, containerWidth - leftAxisSpace - 8);
    const bandwidth = d3
        .scaleBand()
        .domain(uniqueDomainLabels)
        .range([0, estimatedChartWidth])
        .padding(CHART_CONFIG.PADDING.X_SCALE)
        .bandwidth();

    const wrapped = chart.measureWrappedTexts(uniqueDomainLabels, {
        width: bandwidth,
        fontFamily: chart.getChartFont(),
    });

    return (
        OVERVIEW_X_AXIS_LABEL_Y + Math.ceil(wrapped.maxHeight) + OVERVIEW_X_AXIS_LABEL_BOTTOM_BUFFER
    );
}

/**
 * Height the labels above the bars need. Class names wrap over up to two
 * lines (`splitLabelLines`), so the band reserves a second line as soon as
 * any one of them does — the lines the labels will actually draw are what
 * gets measured, so reserve and render agree.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {string[]} classNames - The class names the labels will carry.
 * @returns {number} Reserved height in px.
 */
export function measureOverviewTopAxisSpace(chart, classNames) {
    const splitNames = (classNames || []).map(splitLabelLines);
    const labels = ['L', 'S', ...splitNames.flat()];
    const measured = chart.measureTexts(labels, {
        fontFamily: chart.getChartFont(),
        fontWeight: 'bold',
    });

    const lineCount = splitNames.some((lines) => lines.length > 1) ? MAX_LABEL_LINES : 1;
    const extraLines =
        (lineCount - 1) * chart.resolveChartTextSize('base') * OVERVIEW_CLASS_LABEL_LINE_HEIGHT;

    return Math.ceil(measured.maxHeight + extraLines) + OVERVIEW_TOP_LABEL_BUFFER;
}

/**
 * Narrowest chart (plot) width at which every sub-band still fits its class
 * label's longest line, in px.
 *
 * Solved through the same two band scales the render builds: a band scale is
 * linear in its range, so unit-range scales give the inner step each pixel
 * of chart width buys, and the required width is the label slot divided by
 * that rate. Duplicating the padding arithmetic here instead would drift the
 * moment `CHART_CONFIG.PADDING` changes.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {number} domainCount - Fach/Domäne slots on the outer scale.
 * @param {number} barTypeCount - Bars per slot (states + school + classes).
 * @param {string[]} classLabels - The class names, whose longest split line sets the slot.
 * @returns {number} Required chart width in px; `0` when there is nothing to fit.
 */
export function computeRequiredOverviewChartWidth(chart, domainCount, barTypeCount, classLabels) {
    if (!domainCount || !barTypeCount) return 0;

    const widestLine = chart.measureTexts((classLabels || []).flatMap(splitLabelLines), {
        fontWeight: 'bold',
    }).maxWidth;
    const slot = Math.max(OVERVIEW_MIN_SUB_SLOT, widestLine + OVERVIEW_CLASS_LABEL_GAP);

    const unitOuter = d3
        .scaleBand()
        .domain(d3.range(domainCount).map(String))
        .range([0, 1])
        .padding(CHART_CONFIG.PADDING.X_SCALE);
    const unitInner = d3
        .scaleBand()
        .domain(d3.range(barTypeCount).map(String))
        .range([0, unitOuter.bandwidth()])
        .padding(CHART_CONFIG.PADDING.X_SUB_SCALE);

    return unitInner.step() > 0 ? slot / unitInner.step() : 0;
}

/**
 * Append one wrapped Fach/Domäne label under its slot.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {d3.Selection} xAxisGroup - The axis group.
 * @param {number} centerX - The slot centre.
 * @param {string} label - The label text.
 * @param {number} bandwidth - The slot width the text wraps to.
 * @returns {d3.Selection} The appended text.
 */
function appendOverviewAxisLabel(chart, xAxisGroup, centerX, label, bandwidth) {
    return xAxisGroup
        .append('text')
        .attr('class', 'overview-axis-label')
        .attr('x', centerX)
        .attr('y', OVERVIEW_X_AXIS_LABEL_Y)
        .attr('text-anchor', 'middle')
        .style('fill', STYLE_CONFIG.COLORS.TEXT_PRIMARY)
        .text(label)
        .call((sel) => chart.wrapText(sel, bandwidth));
}

/**
 * Replace the x-axis labels with one per visible slot, optionally fading them in.
 * @param {import('./competencyOverviewRenderer.js').CompetencyOverviewRenderer} chart - The renderer.
 * @param {d3.Selection} xAxisGroup - The axis group.
 * @param {string[]} domainKeys - The visible slots, in order.
 * @param {any} xScale - The band scale over them.
 * @param {Map<string, string>} displayDomainByKey - Display label per slot key.
 * @param {{initialOpacity?: number|null, fadeInDuration?: number}} [options] - Start opacity and fade-in length for a re-render.
 */
export function renderOverviewAxisLabels(
    chart,
    xAxisGroup,
    domainKeys,
    xScale,
    displayDomainByKey,
    /** @type {{initialOpacity?: number|null, fadeInDuration?: number}} */
    { initialOpacity = null, fadeInDuration = 0 } = {},
) {
    if (!xAxisGroup || xAxisGroup.empty()) return;

    xAxisGroup.selectAll('.overview-axis-label').remove();

    domainKeys.forEach((domainKey) => {
        const centerX = xScale(domainKey) + xScale.bandwidth() / 2;
        const displayDomainLabel = displayDomainByKey.get(domainKey) || domainKey;
        const label = appendOverviewAxisLabel(
            chart,
            xAxisGroup,
            centerX,
            displayDomainLabel,
            xScale.bandwidth(),
        );

        if (initialOpacity !== null) {
            label.style('opacity', initialOpacity);
        }

        if (fadeInDuration > 0) {
            if (prefersReducedMotion()) {
                label.style('opacity', 1);
            } else {
                label.transition().duration(fadeInDuration).style('opacity', 1);
            }
        }
    });
}
