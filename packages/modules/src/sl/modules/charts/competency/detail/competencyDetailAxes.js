/**
 * Axes for the competency detail chart: the y-axis, the x-axis line and the
 * bottom (x-axis) labels, plus the height those labels need.
 *
 * Measurement and drawing read one label model (`buildDetailBottomAxisLabels`),
 * so the space reserved below the plot is the space the labels actually take.
 * Imports run one way — this module reads the label geometry from
 * `competencyDetailLabels.js`, never the other way round.
 */

import { createPercentAxis } from '../../../../../common/charts/chartAxisUtils.js';
import {
    LABEL_LINE_HEIGHT,
    fitLabelLine,
    measureExtraLabelLineSpace,
    splitLabelLines,
} from '../../../../../common/charts/chartLabelFit.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { getThemeColors } from '../../../../../common/services/themeService.js';
import { getGroupingConfig } from './competencyDetailGrouping.js';
import { DETAIL_AXIS_LABEL_GAP } from './competencyDetailLabels.js';

/** Baseline of the bottom labels below the axis line, in px. */
const DETAIL_X_AXIS_LABEL_Y = 20;
const DETAIL_X_AXIS_LABEL_BOTTOM_BUFFER = 4;

/**
 * @typedef {object} DetailBottomAxisLabel
 * @property {string} key - The x-axis tick the label belongs to.
 * @property {string} text - What the label prints.
 * @property {string} fontWeight - `bold` marks an aggregate row apart from a class row.
 * @property {boolean} slotted - True for a free-text class name: split over lines and ellipsed to the tick's width.
 */

/**
 * What the bottom axis prints per tick — aggregate rows their own name, class rows their
 * class name — as the one model both the measurement and the drawing read.
 * @param {Array<object>} chartData - The prepared rows the labels are named from.
 * @param {string[]} xDomain - The x-axis ticks in draw order.
 * @param {object} groupingConfig - How the groups nest, which decides what the labels say.
 * @returns {DetailBottomAxisLabel[]} One entry per tick that has data, in tick order.
 */
export function buildDetailBottomAxisLabels(chartData, xDomain, groupingConfig) {
    if (!Array.isArray(xDomain) || xDomain.length === 0) return [];

    if (groupingConfig.groupBySubject) {
        const subjectInfo = {};
        chartData.forEach((d) => {
            if (!subjectInfo[d.subject]) {
                subjectInfo[d.subject] = {
                    displayName: d.subjectLabel || d.subject.toUpperCase(),
                };
            }
        });

        return xDomain
            .filter((subject) => subjectInfo[subject])
            .map((subject) => ({
                key: subject,
                text: subjectInfo[subject].displayName,
                fontWeight: 'normal',
                slotted: false,
            }));
    }

    if (groupingConfig.groupByDomain) {
        const domainInfo = {};
        chartData.forEach((d) => {
            const key = groupingConfig.getGroupKey(d);
            if (!domainInfo[key]) {
                domainInfo[key] = {
                    displayName: d.subjectLabel || d.subject.toUpperCase(),
                    domainLabel: d.domainLabel,
                    displayDomainLabel: d.displayDomainLabel || d.domainLabel,
                };
            }
        });

        return xDomain
            .filter((key) => domainInfo[key])
            .map((key) => {
                const info = domainInfo[key];
                return {
                    key,
                    text: info.domainLabel
                        ? `${info.displayName}: ${info.displayDomainLabel}`
                        : info.displayName,
                    fontWeight: 'normal',
                    slotted: false,
                };
            });
    }

    const classInfo = {};
    chartData.forEach((d) => {
        if (!classInfo[d.name]) {
            classInfo[d.name] = { type: d.type, name: d.name };
        }
    });

    return xDomain
        .filter((className) => classInfo[className])
        .map((className) => ({
            key: className,
            text: classInfo[className].name,
            fontWeight: classInfo[className].type !== 'class' ? 'bold' : 'normal',
            slotted: true,
        }));
}

/**
 * Height the bottom axis needs for its labels, measured rather than assumed so a long
 * class or Domäne name is not clipped. Free-text class names wrap over up to two
 * lines (`splitLabelLines`), so the split lines are what gets measured.
 * @param {object} renderer - The chart renderer, used for its text measurer and font.
 * @param {string[]} xDomain - The x-axis ticks in draw order.
 * @param {object} groupingConfig - How the groups nest, which decides what the labels say.
 * @returns {number} Reserved height in px; `0` when there is nothing to label.
 */
export function measureDetailBottomAxisSpace(renderer, xDomain, groupingConfig) {
    const labels = buildDetailBottomAxisLabels(renderer.chartData, xDomain, groupingConfig)
        .map((label) => label.text)
        .filter(Boolean);
    if (labels.length === 0) return 0;

    const measured = renderer.measureTexts(labels.flatMap(splitLabelLines), {
        fontFamily: renderer.getChartFont(),
    });
    const extraLines = measureExtraLabelLineSpace(renderer.resolveChartTextSize('base'), labels);

    return (
        DETAIL_X_AXIS_LABEL_Y +
        Math.ceil(measured.maxHeight + extraLines) +
        DETAIL_X_AXIS_LABEL_BOTTOM_BUFFER
    );
}

/**
 * Append y-axis, rotated y-label, x-axis line, and grouped x-axis labels for multi-domain view.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} g - The plot group the axes are appended to.
 * @param {d3.ScaleBand<string>} xScale - Band scale over the x-axis ticks.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale.
 * @param {object} chartData - The prepared data, which decides how the labels group.
 * @param {number} height - Plot height in px, where the x-axis sits.
 */
export function addMultiDomainAxes(chart, g, xScale, yScale, chartData, height) {
    const { groupPositions } = g.datum() || {};

    g.append('g')
        .attr('class', 'y-axis')
        .call(createPercentAxis('left', yScale, { step: 10 }));

    chart.renderAxisTitle(g, 'left', `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`, {
        fontWeight: 'bold',
        className: 'axis-label',
    });

    const xAxisGroup = appendXAxisLine(g, xScale, height);

    const groupingConfig = getGroupingConfig(chartData, chart.className);
    addGroupedAxesLabels(chart, xAxisGroup, xScale, chartData, groupingConfig, groupPositions);
}

/**
 * Append y-axis and x-axis with per-entry labels for single-domain view.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} g - The plot group the axes are appended to.
 * @param {any} xScale - Band scale over the x-axis ticks. `any`, not `d3.ScaleBand<string>`: this method invokes it, and d3 types that call `number|undefined`, while the code relies on every drawn row having a tick. Narrowing it would mean adding guards, which is a behaviour change.
 * @param {d3.ScaleLinear<number, number>} yScale - Percentage scale.
 * @param {Array<object>} chartData - The prepared rows, one label each.
 * @param {number} height - Plot height in px, where the x-axis sits.
 */
export function addSingleDomainAxes(chart, g, xScale, yScale, chartData, height) {
    g.append('g')
        .attr('class', 'y-axis')
        .call(createPercentAxis('left', yScale, { step: 10 }));

    const xAxisGroup = appendXAxisLine(g, xScale, height);

    const labelSlot = Math.max(0, xScale.step() - DETAIL_AXIS_LABEL_GAP);
    chartData.forEach((d) => {
        const centerX = xScale(d.name) + xScale.bandwidth() / 2;
        const fontWeight = d.type !== 'class' ? 'bold' : 'normal';
        renderAxisLabel(chart, xAxisGroup, centerX, DETAIL_X_AXIS_LABEL_Y, d.name, {
            fontWeight,
            slot: labelSlot,
        });
    });
}

/**
 * Append the axis group at the plot's foot and draw the horizontal axis line into it.
 * @param {d3.Selection} g - The plot group.
 * @param {any} xScale - Band scale over the x-axis ticks, read for its range.
 * @param {number} height - Plot height in px, where the x-axis sits.
 * @returns {d3.Selection} The axis group, for the labels to be appended to.
 */
function appendXAxisLine(g, xScale, height) {
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

    return xAxisGroup;
}

/**
 * Append a single styled text element to the x-axis group.
 *
 * With a `slot`, the label is treated as a free-text class name: split over
 * up to two lines (stacked downwards, so the first line keeps the
 * single-line baseline) and each line middle-ellipsed to the slot as a last
 * resort. Without one it is a controlled-vocabulary label and drawn as-is.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} xAxisGroup - The axis group the label is appended to.
 * @param {number} x - Label centre in px.
 * @param {number} y - Label baseline in px, below the axis line.
 * @param {string} text - The label.
 * @param {{fontWeight?: string, slot?: number|null}} [style] - Bold marks an aggregate row apart from a class row; `slot` is the width available to each line, in px.
 */
function renderAxisLabel(chart, xAxisGroup, x, y, text, style = {}) {
    const { fontWeight = 'normal', slot = null } = style;
    const label = xAxisGroup
        .append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .style('font-weight', fontWeight)
        .style('fill', getThemeColors().chrome.text);

    if (slot === null) {
        label.text(text);
        return;
    }

    const lines = splitLabelLines(text);
    const lineHeight = chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT;
    lines.forEach((line, lineIndex) => {
        label
            .append('tspan')
            .attr('x', x)
            .attr('y', y)
            .attr('dy', `${lineIndex * lineHeight}px`)
            .text(fitLabelLine(chart, line, slot, { fontWeight }));
    });
}

/**
 * Draw the bottom labels of the grouped (multi-domain) view, one per tick of the model.
 * @param {import('./competencyDetailRenderer.js').CompetencyDetailRenderer} chart - The renderer: tooltips, text measurement and its data.
 * @param {d3.Selection} xAxisGroup - The axis group the labels are appended to.
 * @param {any} xScale - Band scale over the x-axis ticks. `any` for the same reason as `addSingleDomainAxes`: the call is typed `number|undefined` and the code relies on every drawn group having a tick.
 * @param {object} chartData - The prepared data.
 * @param {object} groupingConfig - How the groups nest, from `getGroupingConfig`.
 * @param {Record<string, any>|null} [groupPositions] - Measured group extents from the bar layout; without them the centres are derived from the band scale.
 */
function addGroupedAxesLabels(
    chart,
    xAxisGroup,
    xScale,
    chartData,
    groupingConfig,
    groupPositions = /** @type {Record<string, any>|null} */ (null),
) {
    const getGroupCenter = (key) => {
        if (groupPositions && groupPositions[key]) {
            return groupPositions[key].x + groupPositions[key].width / 2;
        }
        return xScale(key) + xScale.bandwidth() / 2;
    };

    const labelSlot = Math.max(0, xScale.step() - DETAIL_AXIS_LABEL_GAP);
    buildDetailBottomAxisLabels(chartData, xScale.domain(), groupingConfig).forEach((label) => {
        renderAxisLabel(
            chart,
            xAxisGroup,
            getGroupCenter(label.key),
            DETAIL_X_AXIS_LABEL_Y,
            label.text,
            { fontWeight: label.fontWeight, slot: label.slotted ? labelSlot : null },
        );
    });
}
