/**
 * The frame an SL competence share chart draws its bars in: the left
 * Schüler:innen-percent axis with its gridlines behind the bars and its title; and what
 * the chart says of a bar beyond it, its tooltip and its rows in the data table.
 */

import * as d3 from 'd3';
import {
    appendPercentAxis,
    measurePercentAxisSpace,
} from '../../../../../common/charts/chartAxisUtils.js';
import { shareCountColumns } from '../../../../../common/charts/dataTableCells.js';
import { STUDENT_SHARE_AXIS_TITLE, TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import {
    buildCompetenceTooltipRows,
    competenceBarCells,
    competenceNoDataTooltip,
} from './competenceChartData.js';

/** @typedef {import('../../../../../common/charts/renderers/chartRenderer.js').ChartRenderer} ChartRenderer */
/** @typedef {import('./competenceChartData.js').CompetenceFiguresRow} FiguresRow */

/**
 * Width the left percent axis and its title need.
 * @param {ChartRenderer} chart
 * @returns {number} In px.
 */
export function shareAxisSpace(chart) {
    return measurePercentAxisSpace(chart, 'left', { axisTitleText: STUDENT_SHARE_AXIS_TITLE });
}

/**
 * Lay the chart out with `axes` reserved and set up the percent scale; with `axis`, draw
 * the percent axis with its gridlines first, so they sit behind the bars.
 * @param {ChartRenderer} chart
 * @param {{left?: number, right?: number, top?: number, bottom?: number}} axes - Reserved space per side, in px.
 * @param {{axis: boolean}} options - Whether the frame draws its axis (a thumbnail draws none).
 * @returns {{g: d3.Selection<SVGGElement, unknown, any, any>, width: number, height: number, yScale: d3.ScaleLinear<number, number>}} The plot group and its size.
 */
export function openShareFrame(chart, axes, { axis }) {
    const { g, layout } = chart.initializeSVG(axes);
    const { width, height } = layout.chart;
    const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);
    if (axis) appendPercentAxis(g, 'left', yScale, width);
    return { g, width, height, yScale };
}

/**
 * Finish the frame once the bars are drawn: the percent axis's title, after the marks.
 * @param {ChartRenderer} chart
 * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group.
 * @param {{axis: boolean}} options - Whether the frame has its axis.
 */
export function closeShareFrame(chart, g, { axis }) {
    if (axis) chart.renderAxisTitle(g, 'left', STUDENT_SHARE_AXIS_TITLE);
}

/**
 * The tooltip of one bar segment, counted on the bar's own row, or the note that the row
 * has no figures.
 * @param {ChartRenderer} chart
 * @param {FiguresRow} row
 * @param {string} level - The segment's Kompetenzstufe.
 * @param {{title: string, subtitle?: string}} heading - The bar's Bereich, and whom it counts.
 * @returns {import('../../../../../common/services/cursorTooltip.js').TooltipContent}
 */
export function competenceShareTooltip(chart, row, level, { title, subtitle }) {
    const rows = buildCompetenceTooltipRows(row, level);
    if (!rows) return competenceNoDataTooltip(chart.context.glossary);
    return { title, subtitle, rows };
}

/**
 * The bars as a data table: per bar its Bereich and whom it counts, then its headcount
 * and per shown Kompetenzstufe its share with its count.
 * @param {Array<{area: string, valueGroup: string, row: FiguresRow|null, ladder: string[]}>} bars - In draw order; `row` is the bar's own (`null` for a group that did not sit the Fach), `ladder` its Kompetenzstufen.
 * @param {string[]} levels - The shown Kompetenzstufen.
 * @returns {{columns: import('../../../../../common/charts/host/chartDataTable.js').ChartDataColumn[], rows: import('../../../../../common/charts/host/chartDataTable.js').ChartDataCell[][]}}
 */
export function competenceShareTable(bars, levels) {
    return {
        columns: [
            { label: TERM_CONSTANTS.AREA },
            { label: TERM_CONSTANTS.VALUE_GROUP },
            ...shareCountColumns(levels),
        ],
        rows: bars.map(({ area, valueGroup, row, ladder }) => [
            { text: area },
            { text: valueGroup },
            ...competenceBarCells(row, levels, ladder),
        ]),
    };
}
