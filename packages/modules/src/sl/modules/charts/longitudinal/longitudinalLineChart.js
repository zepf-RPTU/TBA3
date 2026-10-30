/**
 * Timeline chart: one line per category across a variable number of years, or the
 * categories as stacked bands. Its stylesheet keeps the year dots' colours under forced
 * colours and rings them.
 */

import { createState } from '@tba3/module-base';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';

import {
    appendAxisGroup,
    callGridLines,
    createCategoryAxis,
    createPercentAxis,
    measurePercentAxisSpace,
    measurePercentEdgeTickReserve,
    percentAxisMax,
} from '../../../../common/charts/chartAxisUtils.js';
import { AXIS_DEFAULTS, MARK_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { animate, fadeOutAndRemove, takeBack } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { spreadLabelPositions } from '../../../../common/charts/chartLabelFit.js';
import * as d3 from 'd3';
import { formatPercent } from '../../../../common/utils/numberFormat.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { applyChartTextSize } from '../../../../common/charts/chartTypography.js';
import './longitudinalLineChart.css';
import { DATA_MARK_CLASS } from '../../../../common/services/dataMark.js';
import { figureCell, percentColumn } from '../../../../common/charts/dataTableCells.js';

/** @typedef {import('../../../utils/slHistory.js').LongitudinalYear} LongitudinalYear */

/**
 * What the chart draws: a timeline and its categories' vocabulary. Reactive state, so a
 * Bereich switch moves the drawn series in place.
 * @typedef {object} LineSeries
 * @property {string[]} years - The x-axis, oldest first: every year of the history. A year the timeline lacks is a gap in every line.
 * @property {LongitudinalYear[]} timeline - One entry per year that has data, oldest first.
 * @property {(category: string) => string} colorOf - Colour of a category, asked on every draw so a theme switch repaints through `refresh()`.
 * @property {{[category: string]: string}} [categoryLabels] - Display label per category; a category without one is labelled by its key.
 * @property {ReadonlyArray<string>} categoryOrder - The scale, in draw and stack order. Of it, the categories some year carries are drawn; one a year does not carry reads 0 % that year (nobody reached it). One the timeline carries that it does not list is not drawn.
 */

/**
 * What a LongitudinalLineChart is built with. `lineChartConfig` hands every field
 * over, so none has a default here. `series` and `isStacked` are the chart's state: a
 * signal given is shared (the host's), so its owner's writes redraw the chart.
 * @typedef {object} LongitudinalLineOptions
 * @property {LineSeries | import('@preact/signals-core').Signal<LineSeries>} series
 * @property {string} yAxisLabel
 * @property {boolean | import('@preact/signals-core').Signal<boolean>} isStacked - Whether the categories draw as stacked bands.
 * @property {number} yMax - The largest share across the cards that share this y-axis, in percent, so a line at 20 % is the same height in every card.
 */

/**
 * One year of one category. Stacked, the band runs from `y0` to `y1`; as a line, `y0`
 * is 0 and the line runs through `y1`.
 * @typedef {object} SeriesPoint
 * @property {string} key - The category.
 * @property {string} year
 * @property {number|null} value - The category's share that year; null where it has none, a gap.
 * @property {number} y0 - Where the band starts.
 * @property {number} y1 - Where the band ends, and where the line and the dot sit.
 */

/**
 * One axis year: every category's share, null where the year has none.
 * @typedef {{year: string, values: {[category: string]: number|null}}} YearRow
 */

/**
 * @param {SeriesPoint} point
 * @returns {boolean} Whether the point has a value, so a line, a band and a dot reach it.
 */
const isDefined = (point) => point.value !== null;

/** The transition a redraw moves, brings back and retires the series' marks in. */
const SERIES_TRANSITION = 'line-series';

/**
 * Every series carries a direct label at its right end in both modes.
 */
export class LongitudinalLineChart extends ChartRenderer {
    static DOT_RADIUS_PX = 5;
    /** The radius the `point` hover grows a dot to: the clearance labels and the plot edge keep. */
    static DOT_RADIUS_HOVER_PX =
        LongitudinalLineChart.DOT_RADIUS_PX * MARK_DEFAULTS.hoverScale.head;
    static AREA_OPACITY = 0.7;
    static LINE_OPACITY = 0.8;
    static END_LABEL_GAP_PX = 6;
    /** How far a label may sit off its line's end before a leader line joins them. */
    static LEADER_THRESHOLD_PX = 4;
    /** @type {'sm'|'base'} */
    static END_LABEL_TEXT_SIZE = 'sm';

    /** @type {import('d3').ScalePoint<string>} Domain and range are set at render. */
    xScale = d3.scalePoint();
    /** @type {import('d3').ScaleLinear<number, number>} Domain and range are set at render. */
    yScale = d3.scaleLinear();
    /** @type {boolean|null} Whether the last draw stacked the series; `null` before the first. */
    #drawnStacked = null;

    /**
     * @param {HTMLElement} container
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & LongitudinalLineOptions} options
     */
    constructor(container, options) {
        super(container, { legend: 'top', ...options });

        this.yAxisLabel = options.yAxisLabel;
        this.yMax = options.yMax;

        /** @type {import('@tba3/module-base').State<{isStacked: boolean, series: LineSeries}>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<{isStacked: boolean, series: LineSeries}>} */ ({
                isStacked: options.isStacked,
                series: options.series,
            }),
        );
    }

    /**
     * Whether the categories draw as stacked bands (`state.isStacked`).
     * @returns {boolean}
     */
    get isStacked() {
        return this.state.isStacked.value;
    }

    /**
     * The drawn series (`state.series`).
     * @returns {LineSeries}
     */
    get series() {
        return this.state.series.value;
    }

    /** @override */
    validateData() {
        return this.series.timeline.length > 0;
    }

    /**
     * One year: every series' value that year, in draw order.
     * @param {{year: string, points: SeriesPoint[]}} column
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     * @override
     */
    formatTooltipContent(column) {
        return {
            title: column.year,
            rows: column.points.map((point) => ({
                label: this.#labelOf(point.key),
                value: formatPercent(point.value),
            })),
        };
    }

    /**
     * One row per axis year, as the chart reads it: an untested year is a row of empty
     * cells, a category a tested year does not carry 0 %.
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` without a year.
     */
    dataTable() {
        if (this.series.timeline.length === 0) return null;
        const categories = this.#categories();
        return {
            columns: [
                { label: TERM_CONSTANTS.YEAR },
                ...categories.map((key) => percentColumn(this.#labelOf(key))),
            ],
            rows: this.#rows().map(({ year, values }) => [
                { text: year },
                ...categories.map((key) => figureCell(values[key])),
            ]),
        };
    }

    /**
     * Every axis year with each category's share: null for every category of a year the
     * timeline lacks (untested), 0 for one a tested year does not carry.
     * @returns {YearRow[]} Oldest first.
     */
    #rows() {
        const { timeline } = this.series;
        const byYear = new Map(timeline.map((entry) => [entry.year, entry.categories]));
        const categories = this.#categories();
        return this.series.years.map((year) => {
            const shares = byYear.get(year);
            return {
                year,
                values: Object.fromEntries(
                    categories.map((key) => [
                        key,
                        shares === undefined ? null : (shares[key] ?? 0),
                    ]),
                ),
            };
        });
    }

    /**
     * @returns {string[]} The listed categories some year carries, in list order.
     */
    #categories() {
        const { timeline, categoryOrder } = this.series;
        const present = new Set(timeline.flatMap((year) => Object.keys(year.categories)));
        return categoryOrder.filter((category) => present.has(category));
    }

    /**
     * @param {string} category
     * @returns {string} Its configured label, or the category key itself.
     */
    #labelOf(category) {
        return this.series.categoryLabels?.[category] ?? category;
    }

    /**
     * A series' end label: its name and its last value, `III · 24 %`, so the latest
     * year reads without a tooltip.
     * @param {string} category
     * @param {number|null} value - Its last value, in percent.
     * @returns {string}
     */
    #endLabelOf(category, value) {
        return `${this.#labelOf(category)} · ${formatPercent(value, 0)}`;
    }

    /**
     * The top of the y-scale: 100 for stacked bands, else the shared maximum (`yMax`)
     * rounded up to the tick the axis draws at its length (`percentAxisMax`).
     * @param {number} length - The plot height in px.
     * @returns {number}
     */
    #maxValue(length) {
        return this.isStacked ? 100 : percentAxisMax(this.yMax, length, 'left');
    }

    /**
     * Every category's points in the current mode, in draw order.
     * @returns {Array<{key: string, points: SeriesPoint[]}>}
     */
    #seriesData() {
        const rows = this.#rows();
        const categories = this.#categories();
        // A gap stacks as 0, so the bands above it keep their place.
        const stacked = this.isStacked
            ? /** @type {import('d3').Stack<unknown, YearRow, string>} */ (
                  /** @type {unknown} */ (d3.stack())
              )
                  .keys(categories)
                  .value((row, key) => row.values[key] ?? 0)(rows)
            : null;
        return categories.map((key, i) => ({
            key,
            points: rows.map((row, j) => {
                const value = row.values[key];
                const y0 = stacked ? stacked[i][j][0] : 0;
                return { key, year: row.year, value, y0, y1: y0 + (value ?? 0) };
            }),
        }));
    }

    /**
     * Draw every series, its dots and its end label for the current mode, or move the
     * drawn ones there: the paths, dot groups and labels join by category and the dots
     * by year, so a drawn mark keeps its node. A category or year the series no longer
     * has fades out.
     * @param {number} durationMs - Transition length; 0 sets the geometry outright.
     * @param {{reshape?: boolean}} [options] - `reshape` when the mode changed: a line and a band are different path shapes, and interpolating one into the other draws nonsense, so the paths take their new geometry outright.
     */
    #drawSeries(durationMs, { reshape = false } = {}) {
        const { isStacked } = this;
        const { colorOf } = this.series;
        const series = this.#seriesData();
        /**
         * A leaving mark: off the pointer and the keyboard at once, then faded out.
         * @param {import('d3').Selection<any, any, any, any>} exit
         * @returns {import('d3').Transition<any, any, any, any>}
         */
        const fadeOut = (exit) => fadeOutAndRemove(exit, SERIES_TRANSITION, durationMs);

        // Straight segments between cohorts: each year is an independent Jahrgang, and a
        // smoothed curve would show values no cohort ever had.
        /** @type {(point: SeriesPoint) => number} */
        const xOf = (point) => this.xScale(point.year) ?? 0;
        // A year without a value breaks the line: no segment bridges it.
        const shape = isStacked
            ? d3
                  .area(
                      xOf,
                      (point) => this.yScale(point.y0),
                      (point) => this.yScale(point.y1),
                  )
                  .defined(isDefined)
            : d3.line(xOf, (point) => this.yScale(point.y1)).defined(isDefined);

        /** @type {import('d3').Selection<SVGPathElement, (typeof series)[number], SVGGElement, unknown>} */
        const drawnPaths = this.seriesLayer.selectChildren('path.series');
        const paths = drawnPaths
            .data(series, (d) => d.key)
            .join(
                (enter) => {
                    const entered = enter
                        .append('path')
                        .attr('class', 'series')
                        .style('pointer-events', 'none');
                    // A series new to a drawn chart appears in place rather than
                    // growing out of an empty path.
                    if (durationMs > 0) entered.attr('d', (d) => shape(d.points));
                    return entered;
                },
                (update) => update.interrupt(SERIES_TRANSITION),
                fadeOut,
            )
            .order()
            // The mode rides on the class: `area` for a band, `line` for a line.
            .attr('class', isStacked ? 'series area' : 'series line')
            .style('fill', (d) => (isStacked ? colorOf(d.key) : 'none'))
            .style('stroke', (d) => colorOf(d.key))
            .attr('stroke-width', isStacked ? 1 : MARK_DEFAULTS.lineWidthPx);
        animate(paths, { durationMs: reshape ? 0 : durationMs, name: SERIES_TRANSITION })
            .attr('d', (d) => shape(d.points))
            .style(
                'opacity',
                isStacked ? LongitudinalLineChart.AREA_OPACITY : LongitudinalLineChart.LINE_OPACITY,
            );

        // A plain dot per year, painted by its series' group and ringed in the surface,
        // so dots of series that meet in one year stay apart; the series is identified
        // by its colour and its end label.
        /** @type {(point: SeriesPoint) => string} */
        const place = (point) => `translate(${xOf(point)}, ${this.yScale(point.y1)})`;
        /** @type {import('d3').Selection<SVGGElement, (typeof series)[number], SVGGElement, unknown>} */
        const drawnDots = this.dotLayer.selectChildren('g.series-dots');
        const dots = drawnDots
            .data(series, (d) => d.key)
            .join(
                (enter) => enter.append('g'),
                (update) => takeBack(update, SERIES_TRANSITION).style('opacity', null),
                fadeOut,
            )
            .order()
            .attr('class', `series-dots ${DATA_MARK_CLASS}`)
            .style('fill', (d) => colorOf(d.key))
            .style('stroke', 'var(--color-card-background)')
            .attr('stroke-width', MARK_DEFAULTS.outlineWidthPx)
            .selectAll('circle.dot')
            .data(
                (d) => d.points.filter(isDefined),
                (/** @type {SeriesPoint} */ point) => point.year,
            )
            .join(
                (enter) =>
                    enter
                        .append('circle')
                        .attr('class', 'dot')
                        .attr('r', LongitudinalLineChart.DOT_RADIUS_PX)
                        .attr('transform', place)
                        .style('opacity', 1),
                (update) => {
                    // A year back before its fade-out ended is shown again in full.
                    takeBack(update, SERIES_TRANSITION).style('opacity', 1);
                    animate(update, { durationMs, name: SERIES_TRANSITION }).attr(
                        'transform',
                        place,
                    );
                    return update;
                },
                fadeOut,
            );
        // One hit band per year over every mark: a year's dots sit 10 px across and meet
        // where levels converge, so the year, not the dot, takes the hover and the tab
        // stop, and its tooltip lists every series with a value. The hover grows that
        // year's dots. A year without any value has no band.
        const columns = this.series.years
            .map((year) => ({
                year,
                points: series.flatMap(({ points }) =>
                    points.filter((point) => point.year === year && isDefined(point)),
                ),
            }))
            .filter((column) => column.points.length > 0);
        this.joinHitBands(this.hitLayer, columns, {
            key: (column) => column.year,
            position: (column) => this.xScale(column.year) ?? 0,
            bounds: /** @type {[number, number]} */ (this.xScale.range()),
            across: [0, this.yScale.range()[0]],
            className: 'line-year-hit',
            getTooltipContent: (column) => this.formatTooltipContent(column),
            linked: [
                {
                    marks: dots,
                    match: (point, column) => point.year === column.year,
                    effect: 'point',
                },
            ],
        });

        this.#drawEndLabels(series, durationMs, fadeOut);
    }

    /**
     * Draw or move the direct labels just right of the last year, at the line's value or
     * the band's middle, spread apart where series end close together. An untested last
     * year has none; the key names the series then.
     * @param {Array<{key: string, points: SeriesPoint[]}>} series
     * @param {number} durationMs - Transition length; 0 sets the positions outright.
     * @param {(exit: import('d3').Selection<any, any, any, any>) => void} fadeOut - How a label whose series left goes.
     */
    #drawEndLabels(series, durationMs, fadeOut) {
        const fontSize = this.resolveChartTextSize(LongitudinalLineChart.END_LABEL_TEXT_SIZE);
        const x =
            (this.xScale(this.series.years.at(-1) ?? '') ?? 0) +
            LongitudinalLineChart.DOT_RADIUS_HOVER_PX +
            LongitudinalLineChart.END_LABEL_GAP_PX;
        const anchors = series.flatMap(({ key, points }) => {
            const { y0, y1, value } = /** @type {SeriesPoint} */ (points.at(-1));
            if (value === null) return [];
            return [
                {
                    key,
                    label: this.#endLabelOf(key, value),
                    x,
                    y: this.yScale(this.isStacked ? (y0 + y1) / 2 : y1),
                },
            ];
        });
        const targets = spreadLabelPositions(anchors, {
            minGapPx: fontSize * 1.15,
            min: 0,
            max: this.yScale.range()[0],
        });
        this.#drawLeaders(anchors, targets, durationMs, fadeOut);
        /** @type {import('d3').Selection<SVGTextElement, (typeof targets)[number], SVGGElement, unknown>} */
        const drawn = this.labelLayer.selectChildren('.series-end-label');
        drawn
            .data(targets, (d) => d.key)
            .join(
                (enter) => {
                    const labels = enter
                        .append('text')
                        .attr('class', 'series-end-label')
                        .attr('text-anchor', 'start')
                        .attr('dominant-baseline', 'middle')
                        .attr('x', (d) => d.x)
                        .attr('y', (d) => d.y)
                        .style('fill', 'var(--text-color)')
                        .style('pointer-events', 'none')
                        .text((d) => d.label);
                    applyChartTextSize(labels, LongitudinalLineChart.END_LABEL_TEXT_SIZE);
                    return labels;
                },
                (update) => {
                    takeBack(update, SERIES_TRANSITION)
                        .style('opacity', null)
                        .text((d) => d.label);
                    animate(update, { durationMs, name: SERIES_TRANSITION })
                        .attr('x', (d) => d.x)
                        .attr('y', (d) => d.y);
                    return update;
                },
                fadeOut,
            );
    }

    /**
     * Join each end label that the spread moved off its line's end back to it with a
     * leader line, from just past the last dot to the label's start: converging levels
     * otherwise leave a label beside the wrong line.
     * @param {Array<{key: string, x: number, y: number}>} anchors - Where each label wanted to sit.
     * @param {Array<{key: string, x: number, y: number}>} targets - Where the spread put it.
     * @param {number} durationMs - Transition length.
     * @param {(exit: import('d3').Selection<any, any, any, any>) => void} fadeOut - How a leaving mark goes.
     */
    #drawLeaders(anchors, targets, durationMs, fadeOut) {
        const anchorY = new Map(anchors.map(({ key, y }) => [key, y]));
        const moved = targets.flatMap((target) => {
            const y = /** @type {number} */ (anchorY.get(target.key));
            return Math.abs(target.y - y) > LongitudinalLineChart.LEADER_THRESHOLD_PX
                ? [{ key: target.key, x: target.x, y, labelY: target.y }]
                : [];
        });
        const start = (/** @type {{x: number}} */ d) =>
            d.x -
            LongitudinalLineChart.END_LABEL_GAP_PX -
            LongitudinalLineChart.DOT_RADIUS_HOVER_PX +
            LongitudinalLineChart.DOT_RADIUS_PX;
        /** @type {(lines: any) => any} Write a leader's ends, on its line or a transition on it. */
        const place = (lines) =>
            lines
                .attr('x1', start)
                .attr('y1', (/** @type {(typeof moved)[number]} */ d) => d.y)
                .attr('x2', (/** @type {(typeof moved)[number]} */ d) => d.x - 2)
                .attr('y2', (/** @type {(typeof moved)[number]} */ d) => d.labelY);
        /** @type {import('d3').Selection<SVGLineElement, (typeof moved)[number], SVGGElement, unknown>} */
        const drawn = this.labelLayer.selectChildren('.series-end-leader');
        drawn
            .data(moved, (d) => d.key)
            .join(
                // A new leader appears in place, as its label does, rather than sweeping
                // in from the plot's corner.
                (enter) =>
                    place(enter.append('line').attr('class', 'series-end-leader chart-separator')),
                (update) => {
                    takeBack(update, SERIES_TRANSITION).style('opacity', null);
                    place(animate(update, { durationMs, name: SERIES_TRANSITION }));
                    return update;
                },
                fadeOut,
            );
    }

    /**
     * Draw the chart, or bring the drawn one to the current mode and series: the layers
     * and axes are found again, the series move from where they are drawn, and a
     * stacking switch takes the new path shape outright.
     * @override
     */
    renderChart() {
        const years = this.series.years;
        const categories = this.#categories();
        const durationMs = this.drawDurationMs;
        const reshape = this.#drawnStacked !== null && this.#drawnStacked !== this.isStacked;
        this.#drawnStacked = this.isStacked;

        const bottomAxis = this.measureAxisSpace('bottom', years);
        const leftAxis = measurePercentAxisSpace(this, 'left', {
            axisTitleText: this.yAxisLabel,
        });
        // The top tick label overhangs the plot by half its height, whichever it is.
        const yTickReserve = measurePercentEdgeTickReserve(this, { useHeight: true });
        const topAxis = Math.ceil(
            Math.max(
                yTickReserve,
                LongitudinalLineChart.DOT_RADIUS_HOVER_PX + AXIS_DEFAULTS.edgeTickBufferPx,
            ),
        );
        // The direct series labels sit right of the last year; reserve their width.
        const endLabelReserve =
            LongitudinalLineChart.DOT_RADIUS_HOVER_PX +
            LongitudinalLineChart.END_LABEL_GAP_PX +
            this.measureTexts(
                // The widest a label gets: its name with a three-digit share.
                categories.map((category) => this.#endLabelOf(category, 100)),
                { textSize: LongitudinalLineChart.END_LABEL_TEXT_SIZE },
            ).maxWidth;
        const rightAxis = Math.ceil(
            Math.max(
                LongitudinalLineChart.DOT_RADIUS_HOVER_PX + AXIS_DEFAULTS.edgeTickBufferPx,
                endLabelReserve,
            ),
        );

        const { g, layout } = this.initializeSVG({
            top: topAxis,
            bottom: bottomAxis,
            left: leftAxis,
            right: rightAxis,
        });
        const { width, height } = layout.chart;

        this.xScale = d3
            .scalePoint()
            .domain(years)
            .range([0, width])
            .padding(AXIS_DEFAULTS.pointPaddingRatio);
        this.yScale = d3
            .scaleLinear()
            .domain([0, this.#maxValue(height)])
            .range([height, 0]);

        // The grid sits behind the series; filled/line geometry behind the circles so
        // dot hover remains reachable. The value axis and its gridlines move in step.
        /** @type {import('d3').Selection<SVGGElement, unknown, any, any>} */
        this.gridLayer = selectOrAppend(g, 'g', 'line-grid-layer');
        const axis = createPercentAxis('left', this.yScale);
        callGridLines(
            animate(selectOrAppend(this.gridLayer, 'g', 'grid').attr('data-side', 'left'), {
                durationMs,
            }),
            'left',
            axis,
            width,
        );
        /** @type {import('d3').Selection<SVGGElement, unknown, any, any>} */
        this.seriesLayer = selectOrAppend(g, 'g', 'line-series-layer');
        /** @type {import('d3').Selection<SVGGElement, unknown, any, any>} */
        this.dotLayer = selectOrAppend(g, 'g', 'line-dot-layer');
        /** @type {import('d3').Selection<SVGGElement, unknown, any, any>} */
        this.labelLayer = selectOrAppend(g, 'g', 'line-label-layer');
        /** @type {import('d3').Selection<SVGGElement, unknown, any, any>} */
        this.hitLayer = selectOrAppend(g, 'g', 'line-hit-layer');

        this.#drawSeries(durationMs, { reshape });

        appendAxisGroup(g, 'x-axis', { baseline: true })
            .attr('transform', `translate(0, ${height})`)
            .call(createCategoryAxis('bottom', this.xScale));
        animate(appendAxisGroup(g, 'y-axis'), { durationMs }).call(axis);
        this.renderAxisTitle(g, 'left', this.yAxisLabel);
    }

    /**
     * Stacked mode's key, one colour chip per category. In line mode the end labels name
     * the series, unless the last year is untested and there are none.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        const lastTested = this.series.timeline.at(-1)?.year === this.series.years.at(-1);
        if (!this.isStacked && lastTested) return null;
        const items = this.#categories().map((category) => ({
            label: this.#labelOf(category),
            color: this.series.colorOf(category),
            symbol: 'rect',
        }));
        return [{ items }];
    }
}
