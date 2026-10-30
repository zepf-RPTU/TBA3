/**
 * The EN scatterplot renderer: each student's result in the two domains, against both axes' GER bands
 * and the group and comparison averages: a plot that fills its card within an aspect
 * range, with its key over it. The threshold axes, average markers and zoom are drawn
 * by the sibling scatterThresholdAxes, scatterAverageMarkers and scatterZoomController
 * modules; the selection and each point's look are the ScatterSelectionController's.
 */

import { createState } from '@tba3/module-base';
import { ChartRenderer, HOVER_PRESETS } from '../../../../common/charts/renderers/chartRenderer.js';
import { EN_TERMS } from '../../../enTerms.js';
import { axisDomainIds } from './scatterPointAdapter.js';
import { dataCoversAllCompetenceLevels, selectDrawnAverages } from './scatterZoomDomain.js';
import { simulateJitter } from './scatterJitter.js';
import { zoomDomains } from './scatterZoomController.js';
import {
    drawThresholdAxes,
    joinCompetenceLabels,
    measureThresholdAxesSpace,
    renderAxisTitles,
    validThresholds,
} from './scatterThresholdAxes.js';
import { ScatterSelectionController } from './scatterSelectionController.js';
import {
    comparisonMarkerLegendItem,
    comparisonSeriesLabel,
    visibleComparisonGroups,
} from '../../../../common/charts/comparisonSeries.js';
import { figureCell, percentColumn } from '../../../../common/charts/dataTableCells.js';
import { GROUP_VISUAL, CHART_CONFIG } from './scatterplotConstants.js';
import { joinAveragePoints } from './scatterAverageMarkers.js';
import * as d3 from 'd3';
import { MOTION, animate } from '../../../../common/charts/motionPreference.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import { formatPercent } from '../../../../common/utils/numberFormat.js';
import { formatStudentFullName } from '../../../../common/domain/studentIdentity.js';
import './scatterplot.css';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { DATA_MARK_CLASS } from '../../../../common/services/dataMark.js';

/**
 * A plotted student at its jittered position.
 * @typedef {import('./scatterPointAdapter.js').ScatterPoint & import('./scatterJitter.js').JitterPosition} JitteredPoint
 */

/**
 * The slice of a host's EN configuration the scatterplot reads.
 * @typedef {import('./scatterPointAdapter.js').EnPointConfig & {domainLabels: string[]}} ScatterplotEnConfig
 */

/**
 * @typedef {object} ScatterplotOptions
 * @property {ScatterplotEnConfig} enConfig - Exactly two domains.
 * @property {import('./scatterPointAdapter.js').ScatterPoint[]} [points] - The plotted students, already adapted from student records.
 * @property {{[domainId: string]: {competenceLevelNames: string[], competenceLevelPercentageThresholds: number[]}|null}} [gerThresholds] - `null` where the payload shipped no table.
 * @property {{[domainId: string]: number}} groupAverages - The group marker's value per domain; a domain without one draws no marker.
 * @property {string|null} groupName - The group marker's label.
 * @property {import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup[]} comparisons - One entry per delivered comparison group.
 * @property {boolean} [enableSelection] - Click and marquee selection instead of click-to-navigate.
 * @property {ReadonlySet<string>|import('@preact/signals-core').Signal<ReadonlySet<string>>} [selectedIds] - The selection; the host's signal is shared, so a write from anywhere repaints the points.
 * @property {boolean|import('@preact/signals-core').Signal<boolean>} [touchSelectionArmed] - Whether a touch drag draws a marquee; the host's signal, shared.
 * @property {((target: {studentId: string}) => void)|null} [onStudentClick] - Called on a point click outside selection mode.
 * @property {import('../../../../common/charts/comparisonState.js').ComparisonStateReader|null} [comparisonState]
 * @property {boolean|import('@preact/signals-core').Signal<boolean>} [isZoomed] - Zoomed onto the data (the default) or on the full 0–100 % range; the host's signal is shared, so its zoom toggle redraws the chart.
 */

/**
 * The level of a domain, as the tooltip rows and the table columns head it.
 * @param {string} title
 * @returns {string} `<scale> <domain>`, e.g. `GER Hören`.
 */
const scaleLabel = (title) => `${EN_TERMS.SCALE} ${title}`;

const STUDENT_POINT_COLOR = 'var(--chart-student-point-color)';

/** @augments ChartRenderer */
export class Scatterplot extends ChartRenderer {
    /**
     * Jittered points per zoom state (both domains) at the current size: the points never
     * change for one renderer, so a zoom round trip reuses both states. A new size (both
     * ranges) drops them, so a resize drag does not keep one copy per size it passed.
     * @type {{range: string, byDomain: Map<string, JitteredPoint[]>}}
     */
    #jitterCache = { range: '', byDomain: new Map() };
    /** @type {{x: number[], y: number[]}} In percent, fixed by the options. */
    thresholds;
    /** @type {ScatterSelectionController} */
    #selection;
    /** @type {ScatterplotOptions['onStudentClick']} */
    #onStudentClick = null;
    /** @type {[string, string]} The x-axis domain id, then the y-axis one. */
    axisDomainIds;
    /** @type {number} Set by `renderChart()`. */
    plotWidthPx = 0;
    /** @type {number} Set by `renderChart()`. */
    plotHeightPx = 0;
    /** @type {d3.ScaleLinear<number, number>} Set by `renderChart()`. */
    xScale = d3.scaleLinear();
    /** @type {d3.ScaleLinear<number, number>} Set by `renderChart()`. */
    yScale = d3.scaleLinear();
    /** @type {boolean|null} The zoom state the last pass drew; `null` before the first. */
    #drawnZoom = null;

    /**
     * @param {HTMLElement} container
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions & ScatterplotOptions} options
     */
    constructor(container, options) {
        super(container, {
            legend: 'top',
            ...options,
            // The axes are two tests with their own zoomed spans, so the plot need not be
            // square; the cap keeps a full-width card from flattening it into a strip.
            layout: { aspectRange: { min: 1, max: 1.5 } },
        });

        this.enConfig = options.enConfig;
        this.axisDomainIds = axisDomainIds(this.enConfig);
        this.points = options.points || [];
        /** @type {{[domainId: string]: string}} Axis title per domain id. */
        this.domainTitles = Object.fromEntries(
            this.enConfig.domainIds.map((id, i) => [id, this.enConfig.domainLabels[i]]),
        );
        this.gerThresholds = options.gerThresholds ?? {};
        this.thresholds = validThresholds(this.gerThresholds, this.axisDomainIds);
        this.groupAverages = options.groupAverages;
        this.groupName = options.groupName;
        this.comparisons = options.comparisons;
        /** The averages that draw a marker; the legend, markers and zoom all read this. */
        this.drawnAverages = selectDrawnAverages(
            this.axisDomainIds,
            this.groupAverages,
            this.comparisons,
        );
        /**
         * Whether every competence-level band already holds a point on each axis, student
         * points and drawn averages alike: zooming would then reveal nothing.
         */
        this.coversEveryBand = dataCoversAllCompetenceLevels(this.points, {
            thresholds: this.thresholds,
            domainIds: this.axisDomainIds,
            averages: this.drawnAverages,
        });

        this.enableSelection = options.enableSelection || false;
        this.#selection = new ScatterSelectionController({
            enabled: this.enableSelection,
            selectedIds: options.selectedIds,
            touchSelectionArmed: options.touchSelectionArmed,
            hideTooltip: () => this.hideTooltip(),
        });

        this.#onStudentClick = options.onStudentClick || null;

        this.setComparisonModes(this.comparisons);

        /** @type {import('@tba3/module-base').State<{isZoomed: boolean}>} */
        this.state = createState({ isZoomed: options.isZoomed ?? true });
    }

    /**
     * The selection controller stops following the host's signals; the host keeps them.
     * @override
     */
    destroy() {
        this.#selection.destroy();
        super.destroy();
    }

    /** @override */
    validateData() {
        return this.points.length > 0;
    }

    /**
     * A student point's tooltip.
     * @override
     * @param {import('./scatterPointAdapter.js').ScatterPoint} segment
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent(segment) {
        const [xDomain, yDomain] = this.axisDomainIds;
        return {
            title: formatStudentFullName(segment),
            rows: [
                {
                    label: this.domainTitles[yDomain],
                    value: formatPercent(segment.yPercentage),
                },
                {
                    label: this.domainTitles[xDomain],
                    value: formatPercent(segment.xPercentage),
                },
                {
                    label: scaleLabel(this.domainTitles[yDomain]),
                    value: segment.yGer,
                },
                {
                    label: scaleLabel(this.domainTitles[xDomain]),
                    value: segment.xGer,
                },
            ],
        };
    }

    /**
     * An average marker's tooltip, which has no data point of its own.
     * @param {string} title - What the marker stands for: the group or a comparison group.
     * @param {{[domainId: string]: number}} averages
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatAverageTooltipContent(title, averages) {
        const [xDomain, yDomain] = this.axisDomainIds;
        return {
            title,
            rows: [
                { label: this.domainTitles[yDomain], value: formatPercent(averages[yDomain]) },
                { label: this.domainTitles[xDomain], value: formatPercent(averages[xDomain]) },
            ],
        };
    }

    /**
     * The chart as two tables, in the tooltips' order (y axis first): one row per
     * student with both results and GER levels, then one per average marker drawn, the
     * group's and each shown comparison group's. The zoom frames the plot alone.
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTables} The averages' table only while a marker is drawn; `null` while a message stands in for the plot.
     */
    dataTable() {
        if (!this.validateData()) return null;
        const [xDomain, yDomain] = this.axisDomainIds;
        const [xTitle, yTitle] = [this.domainTitles[xDomain], this.domainTitles[yDomain]];
        const { groupAverages, comparisons } = this.drawnAverages;
        const averages = [
            ...(groupAverages
                ? [{ label: this.groupName ?? TERM_CONSTANTS.GROUP, values: groupAverages }]
                : []),
            ...visibleComparisonGroups(comparisons, this.visibilityState).map((group) => ({
                label: comparisonSeriesLabel(group),
                values: group.domainAverages,
            })),
        ];
        return [
            {
                title: TERM_CONSTANTS.STUDENTS,
                columns: [
                    { label: TERM_CONSTANTS.STUDENT },
                    percentColumn(yTitle),
                    percentColumn(xTitle),
                    { label: scaleLabel(yTitle) },
                    { label: scaleLabel(xTitle) },
                ],
                rows: this.points.map((point) => [
                    { text: formatStudentFullName(point) },
                    figureCell(point.yPercentage),
                    figureCell(point.xPercentage),
                    { text: point.yGer ?? '' },
                    { text: point.xGer ?? '' },
                ]),
            },
            averages.length > 0 && {
                title: TERM_CONSTANTS.AVERAGES,
                columns: [
                    { label: TERM_CONSTANTS.VALUE_GROUP },
                    percentColumn(yTitle),
                    percentColumn(xTitle),
                ],
                rows: averages.map(({ label, values }) => [
                    { text: label },
                    figureCell(values[yDomain]),
                    figureCell(values[xDomain]),
                ]),
            },
        ];
    }

    /**
     * The points, the group marker and one marker per comparison group.
     * @override
     * @returns {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        const { groupAverages, comparisons } = this.drawnAverages;
        /** @type {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyItem[]} */
        const legendItems = [];

        legendItems.push({
            symbol: 'circle',
            color: STUDENT_POINT_COLOR,
            label: TERM_CONSTANTS.STUDENTS,
        });

        if (groupAverages) {
            legendItems.push({
                symbol: GROUP_VISUAL.symbol,
                color: GROUP_VISUAL.color,
                // Drawn only from the group's own aggregation, which names it.
                label: /** @type {string} */ (this.groupName),
                glossaryKey: GROUP_VISUAL.glossaryKey,
            });
        }

        // Several groups of one type share a symbol and a base colour; the ordinal in
        // the label ties a legend row to the tag on its marker.
        for (const group of comparisons) {
            legendItems.push(comparisonMarkerLegendItem(group));
        }

        return [{ items: legendItems }];
    }

    /**
     * Draw the chart, or move the drawn one: every mark joins by key (axes by side, band
     * labels by level, markers by group, points by student), so a zoom toggle or a
     * resize moves what is already drawn.
     * @override
     */
    renderChart() {
        // A first draw moves nothing; a zoom toggle moves at the zoom's own, slower pace.
        const isZoomed = this.state.isZoomed.value;
        let durationMs = this.drawDurationMs;
        if (durationMs > 0 && this.#drawnZoom !== isZoomed) durationMs = MOTION.SLOW_MS;
        this.#drawnZoom = isZoomed;

        const { svg, g, layout } = this.initializeSVG(measureThresholdAxesSpace(this));

        this.plotWidthPx = layout.chart.width;
        this.plotHeightPx = layout.chart.height;

        // The zoom is state, so a re-render (resize, refresh) keeps the user's choice.
        const domains = zoomDomains(this, isZoomed);
        this.xScale = d3.scaleLinear().domain(domains.x).range([0, this.plotWidthPx]);
        this.yScale = d3.scaleLinear().domain(domains.y).range([this.plotHeightPx, 0]);

        drawThresholdAxes(this, g, durationMs);
        renderAxisTitles(this, g);

        // The point cloud first, the averages over it: a marker inside the cloud must
        // stay visible and hoverable.
        const pointLayer = selectOrAppend(g, 'g', 'student-points');
        const markerLayer = selectOrAppend(g, 'g', 'average-markers');
        joinAveragePoints(this, markerLayer, durationMs);
        joinCompetenceLabels(this, g, durationMs);
        this.#renderStudentPoints(svg, g, pointLayer, durationMs);
    }

    /**
     * The points spread by force-based jitter so they do not overlap, cached per zoom
     * state at the current size so the positions stay stable across re-renders and a zoom
     * round trip reuses both states.
     * @param {import('./scatterPointAdapter.js').ScatterPoint[]} scatterplotData
     * @returns {JitteredPoint[]}
     */
    #applyJitterSimulation(scatterplotData) {
        const { xScale, yScale } = this;
        const cache = this.#jitterCache;
        const range = `${xScale.range()}|${yScale.range()}`;
        if (range !== cache.range) {
            cache.range = range;
            cache.byDomain.clear();
        }
        const key = `${xScale.domain()}|${yScale.domain()}`;
        let jittered = cache.byDomain.get(key);
        if (!jittered) {
            jittered = simulateJitter(scatterplotData, {
                xScale,
                yScale,
                jitter: CHART_CONFIG.JITTER,
                pointRadiusPx: CHART_CONFIG.POINTS.RADIUS_PX,
                thresholds: this.thresholds,
            });
            cache.byDomain.set(key, jittered);
        }
        return jittered;
    }

    /**
     * Join the student points by student id at their jittered positions: drawn on the
     * first pass, moved on the next (a zoom re-jitters against the rescaled axes). The
     * points take the keyboard; the pointer picks the nearest one (`wireNearestPoints`).
     * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg - The chart root the pointer and the rectangle selection listen on.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The plot group, the rectangle selection's coordinate space.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} layer - The point cloud's layer, under the averages.
     * @param {number} durationMs - `0` moves them at once.
     */
    #renderStudentPoints(svg, g, layer, durationMs) {
        const jittered = this.#applyJitterSimulation(this.points);
        /** @type {d3.Selection<SVGCircleElement, JitteredPoint, any, any>} */
        const existing = layer.selectChildren('circle.student-point');
        const points = existing
            .data(jittered, (d) => d.studentId)
            .join(
                (enter) =>
                    enter
                        .append('circle')
                        .attr('class', `student-point ${DATA_MARK_CLASS}`)
                        .attr('cx', (d) => d.x)
                        .attr('cy', (d) => d.y)
                        .attr('r', CHART_CONFIG.POINTS.RADIUS_PX)
                        .style('fill', STUDENT_POINT_COLOR),
                (update) => {
                    animate(update, { durationMs, name: 'student-point' })
                        .attr('cx', (d) => d.x)
                        .attr('cy', (d) => d.y);
                    return update;
                },
            );
        // The resting look comes from the controller, the one place that decides it.
        this.#selection.paintResting(points);

        this.wireNearestPoints(points, {
            position: (d) => [d.x, d.y],
            suspended: () => this.#selection.isRectangleSelecting,
            getTooltipContent: (d) => this.formatTooltipContent(d),
            // The point look, plus full strength for a point the selection dims.
            hoverEffect: {
                enter: { ...HOVER_PRESETS.point.enter, opacity: 1 },
                leave: {
                    ...HOVER_PRESETS.point.leave,
                    opacity: (/** @type {JitteredPoint} */ d) =>
                        this.#selection.restingStyle(d).opacity,
                },
                useTransition: true,
            },
            onClick: (d, event) => {
                if (this.enableSelection) {
                    event.stopPropagation();
                    this.#selection.toggle(d.studentId);
                    return;
                }

                this.#onStudentClick?.({ studentId: d.studentId });
            },
        });

        if (this.enableSelection) {
            this.#selection.wireRectangleSelection(svg, g, points);
        }
    }
}
