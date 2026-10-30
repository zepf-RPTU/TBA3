/**
 * LongitudinalBoxPlotChart — Unterrichtsqualität (top row) and Selbstwirksamkeit (bottom
 * row) on the 1–5 scale, one box per year, each computed from that year's own student
 * values (`buildSurveyBoxTimeline`).
 */

import { boxWidthFor, drawBoxPlotFigure, joinBoxPlotFigures } from '../shared/boxPlotFigure.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { animate } from '../../../../common/charts/motionPreference.js';
import { boxPlotKey } from '../shared/boxPlotKey.js';
import { RATING_DOMAIN } from '../../../../common/domain/apiValueMaps.js';
import { BOX_STATS_COLUMNS, boxPlotTooltip, boxStatsCells } from '../../../utils/slBoxPlotStats.js';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import {
    appendAxisGroup,
    appendGridLines,
    createCategoryAxis,
    createRatingAxis,
    measureRatingAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import * as d3 from 'd3';
import { createState } from '@tba3/module-base';
import { AXIS_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { SL_SERIES_COLORS } from '../../../utils/slRatingAppearance.js';

/** @typedef {import('../../../utils/slBoxPlotStats.js').BoxPlotStats} BoxPlotStats */
/** @typedef {import('../../../utils/slLongitudinalTimelines.js').LongitudinalBoxPlotYear} LongitudinalBoxPlotYear */

/**
 * One measure's row of the chart.
 * @typedef {object} BoxPlotRow
 * @property {'teachingQuality'|'selfEfficacy'} key - The measure, as the timeline names it.
 * @property {string} axisClass
 * @property {readonly [number, number]} span - Where the row sits on the stacked left axis, as fractions of the plot height.
 * @property {string} title
 * @property {string} measure - Its name in the tooltip.
 * @property {string} color - Its colour's `var()`.
 */

/**
 * The two rows, top to bottom, each over 45 % of the plot height so the same rating
 * step is the same height in both.
 * @type {ReadonlyArray<BoxPlotRow>}
 */
const ROWS = Object.freeze([
    {
        key: 'teachingQuality',
        axisClass: 'y-axis-teaching',
        span: [0, 0.45],
        title: TERM_CONSTANTS.TEACHING_QUALITY,
        measure: TERM_CONSTANTS.TEACHING_QUALITY_MEASURE,
        color: SL_SERIES_COLORS.teachingQuality,
    },
    {
        key: 'selfEfficacy',
        axisClass: 'y-axis-self-efficacy',
        span: [0.55, 1],
        title: TERM_CONSTANTS.SELF_EFFICACY,
        measure: TERM_CONSTANTS.SELF_EFFICACY,
        color: SL_SERIES_COLORS.selfEfficacy,
    },
]);

/** The transition a redraw moves the median connectors in. */
const CONNECTOR_TRANSITION = 'median-connector';

export class LongitudinalBoxPlotChart extends ChartRenderer {
    /**
     * @param {HTMLElement} container
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & {
     *     timeline: LongitudinalBoxPlotYear[] | import('@preact/signals-core').ReadonlySignal<LongitudinalBoxPlotYear[]>,
     * }} options - `timeline`: one entry per year that has values, oldest first; a signal
     *     (the selected Bereich's) moves the figures in place when it changes.
     */
    constructor(container, { timeline, ...options }) {
        super(container, {
            legend: 'side',
            layout: { padding: { top: 10, right: 10, bottom: 10, left: 10 } },
            ...options,
        });

        /** @type {import('@tba3/module-base').State<{timeline: LongitudinalBoxPlotYear[]}>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<{timeline: LongitudinalBoxPlotYear[]}>} */ ({
                timeline,
            }),
        );
    }

    /**
     * The drawn years (`state.timeline`).
     * @returns {LongitudinalBoxPlotYear[]}
     */
    get #timeline() {
        return this.state.timeline.value;
    }

    /** @override */
    validateData() {
        return this.#timeline.length > 0;
    }

    /**
     * The side panel: the axis titles name the rows in ink, the key ties each colour to
     * its row and explains the figure.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        return boxPlotKey(ROWS.map((row) => ({ label: row.title, color: row.color })));
    }

    /**
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` without a year.
     */
    dataTable() {
        if (this.#timeline.length === 0) return null;
        return {
            columns: [
                { label: TERM_CONSTANTS.YEAR },
                { label: TERM_CONSTANTS.METRIC },
                ...BOX_STATS_COLUMNS,
            ],
            rows: this.#timeline.flatMap((yearData) =>
                ROWS.map((row) => [
                    { text: String(yearData.year) },
                    { text: row.measure },
                    ...boxStatsCells(yearData[row.key]),
                ]),
            ),
        };
    }

    /**
     * @param {{yearData: LongitudinalBoxPlotYear, row: BoxPlotRow}} segment
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     * @override
     */
    formatTooltipContent({ yearData, row }) {
        return boxPlotTooltip(yearData[row.key], { title: yearData.year, subtitle: row.measure });
    }

    /** @override */
    renderChart() {
        const durationMs = this.drawDurationMs;
        const years = this.#timeline.map((entry) => entry.year);

        // Both titles share the one left column, so it is as wide as the wider needs.
        const axisLeftSpace = Math.max(
            ...ROWS.map((row) =>
                measureRatingAxisSpace(this, 'left', {
                    min: RATING_DOMAIN[0],
                    max: RATING_DOMAIN[1],
                    axisTitleText: row.title,
                }),
            ),
        );
        const axisBottomSpace = this.measureAxisSpace('bottom', years);

        const { g, layout } = this.initializeSVG({ left: axisLeftSpace, bottom: axisBottomSpace });
        const { width, height } = layout.chart;

        const xScale = d3
            .scalePoint()
            .domain(years)
            .range([0, width])
            .padding(AXIS_DEFAULTS.pointPaddingRatio);
        appendAxisGroup(g, 'x-axis', { baseline: true })
            .attr('transform', `translate(0, ${height})`)
            .call(createCategoryAxis('bottom', xScale));

        const boxWidth = boxWidthFor(xScale.step());
        // Each measure draws into a layer of its own, which holds its own grid and title.
        for (const row of ROWS) {
            this.#drawRow(selectOrAppend(g, 'g', `box-row-${row.key}`), row, {
                xScale,
                width,
                height,
                boxWidth,
                durationMs,
            });
        }
    }

    /**
     * Draw one measure's row into its layer: its rating axis and title, a box per year,
     * and the connectors joining the boxes at their medians. A redraw moves what is
     * drawn, the boxes joined by year and the connectors by the years they join.
     * @param {import('d3').Selection<SVGGElement, unknown, any, any>} layer
     * @param {BoxPlotRow} row
     * @param {{xScale: import('d3').ScalePoint<string>, width: number, height: number, boxWidth: number, durationMs: number}} geometry - The year scale, the plot size, the box width and how long a drawn row moves.
     */
    #drawRow(layer, row, { xScale, width, height, boxWidth, durationMs }) {
        const { color } = row;
        /** @type {[number, number]} */
        const span = [row.span[0] * height, row.span[1] * height];
        const yScale = d3.scaleLinear().domain(RATING_DOMAIN).range([span[1], span[0]]);

        const axis = createRatingAxis('left', yScale);
        appendGridLines(layer, 'left', axis, width);
        appendAxisGroup(layer, row.axisClass).call(axis);
        this.renderAxisTitle(layer, 'left', row.title, { span });

        // Every year is in the point scale's domain: the domain is built from these rows.
        const xOf = (/** @type {LongitudinalBoxPlotYear} */ yearData) =>
            /** @type {number} */ (xScale(yearData.year));

        const chart = this;
        joinBoxPlotFigures(
            selectOrAppend(layer, 'g', 'box-figures'),
            this.#timeline,
            (yearData) => yearData.year,
            durationMs,
        ).each(function (yearData) {
            // The figure's hit area is the year's one hover target and keyboard stop.
            const hitArea = drawBoxPlotFigure(d3.select(this), yearData[row.key], {
                center: xOf(yearData),
                boxWidth,
                valueScale: yScale,
                color,
                durationMs,
            });
            chart.wireTooltipEvents(hitArea, {
                getTooltipContent: () => chart.formatTooltipContent({ yearData, row }),
                hoverEffect: 'band',
            });
        });

        // Box edge to box edge, not through the boxes.
        const connectors = d3.pairs(this.#timeline).map(([current, next]) => ({
            key: `${current.year}|${next.year}`,
            x1: xOf(current) + boxWidth / 2,
            x2: xOf(next) - boxWidth / 2,
            y1: yScale(current[row.key].median),
            y2: yScale(next[row.key].median),
        }));
        /** @type {(lines: any) => any} Write a connector's ends, on its line or a transition on it. */
        const place = (lines) =>
            lines
                .attr('x1', (/** @type {(typeof connectors)[number]} */ d) => d.x1)
                .attr('x2', (/** @type {(typeof connectors)[number]} */ d) => d.x2)
                .attr('y1', (/** @type {(typeof connectors)[number]} */ d) => d.y1)
                .attr('y2', (/** @type {(typeof connectors)[number]} */ d) => d.y2);
        /** @type {import('d3').Selection<SVGLineElement, (typeof connectors)[number], SVGGElement, unknown>} */
        const drawn = selectOrAppend(layer, 'g', 'median-connectors').selectChildren('line');
        drawn
            .data(connectors, (d) => d.key)
            .join(
                (enter) => place(enter.append('line').attr('class', `median-connector-${row.key}`)),
                (update) => {
                    place(
                        animate(update.interrupt(CONNECTOR_TRANSITION), {
                            durationMs,
                            name: CONNECTOR_TRANSITION,
                        }),
                    );
                    return update;
                },
            )
            .style('stroke', color)
            .attr('stroke-width', 2)
            .attr('opacity', 0.6);
    }
}
