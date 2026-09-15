/**
 * Longitudinal Box Plot Chart for Teaching Quality and Self-Efficacy
 * - Top row: Teaching Quality (scale 1-5)
 * - Bottom row: Self-Efficacy (scale 1-5)
 *
 * Both rows read `history.json`: which years exist, which of them are measured, and
 * every year's values come from the payload (see `historyAdapter.js`). Each year's
 * statistics are computed from that year's own student values, so the quartiles are
 * real order statistics throughout - the generator this replaced derived q1/q3 from
 * mean +/- 0.675 * SD for every year but the measured one.
 */

import { appendBoxGradient, drawBoxPlotFigure } from '../shared/boxPlotFigure.js';
import { calculateDetailedBoxPlotStats } from '../../../utils/slBoxPlotStats.js';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import {
    chartLayoutPreset,
    createRatingAxis,
    measureCategoryAxisSpace,
    measureEdgeTickReserve,
    measureRatingAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { buildSurveyHistory, buildYearAxis } from './historyAdapter.js';
import * as d3 from 'd3';

// Constants
const WHISKER_CAP_WIDTH_RATIO = 0.5;

/**
 * Longitudinal Box Plot Chart Class
 * Extends ChartRenderer to provide longitudinal box plot visualization
 */
export class LongitudinalBoxPlotChart extends ChartRenderer {
    constructor(containerId, domainArray, history, options = {}) {
        // Default dimensions used when container has no size
        const defaultWidth = options.width ?? 900;
        const defaultHeight = options.height ?? 600;

        super(containerId, {
            defaultWidth,
            defaultHeight,
            autoResize: true,
            layout: chartLayoutPreset('paddedNoLegend'),
        });

        this.domainArray = domainArray;
        this.history = history;

        // Which domain group the teaching-quality boxplot reflects. Mirrors the
        // longitudinal "Bereich" selector so boxplot mode stays in sync with the
        // parallel chart instead of always showing the first subject.
        this.domainIndex = options.domainIndex ?? 0;

        // Store cache in chartState for automatic cleanup
        this.chartState.cache = {
            timeline: null,
        };
    }

    validateData() {
        return this.getTimeline().length > 0;
    }

    /**
     * Format tooltip content for box plot data
     * @param {object} segment - Contains yearData and data (box plot stats)
     * @param {object} context - Context with metricLabel and isCurrentYear
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        const { yearData, data } = segment;
        const { metricLabel, isCurrentYear } = context;

        const rows = [
            { label: 'Median', value: data.median.toFixed(2) },
            { label: 'Mittelwert', value: data.mean.toFixed(2) },
            { label: 'Std.-Abw.', value: data.standardDeviation.toFixed(2) },
            { label: 'Q1 / Q3', value: `${data.q1.toFixed(2)} / ${data.q3.toFixed(2)}` },
            // Honest now: these are the extremes of the non-outlying data, which is what
            // a reader assumes a whisker end is. Under the same label they used to be
            // mean ± 1.5·SD, clamped to the scale rather than to anything measured.
            {
                label: 'Min / Max',
                value: `${data.whiskerMin.toFixed(2)} / ${data.whiskerMax.toFixed(2)}`,
            },
        ];

        return this.buildTooltipHTML({
            title: `${yearData.year}${isCurrentYear ? ' (aktuell)' : ''}`,
            subtitle: metricLabel,
            rows,
        });
    }

    /**
     * The full timeline, cached for the render pass.
     * @returns {Array<object>} One entry per year that has values, oldest first.
     */
    getTimeline() {
        if (!this.chartState.cache.timeline) {
            this.chartState.cache.timeline = this.buildTimeline();
        }
        return this.chartState.cache.timeline;
    }

    /**
     * Box statistics per year for both measures.
     *
     * Unterrichtsqualitaet is scoped to the selected domain group's students, matching
     * the parallel-coordinates mode and the "Bereich" selector; Selbstwirksamkeit is
     * whole-school, because it is asked once per student rather than per Fach.
     *
     * A year is kept only when **both** measures have values: the chart draws two
     * connected rows over one x-scale, and a year present in one row and missing from
     * the other would break the connecting lines rather than degrade.
     * @returns {Array<{year: string, measured: boolean, teachingQuality: object, selfEfficacy: object}>} The timeline, oldest year first.
     * @private
     */
    buildTimeline() {
        const domainGroup = this.domainArray?.[this.domainIndex] ?? this.domainArray?.[0];
        const studentIds = new Set();
        domainGroup?.forEach((result) => {
            result.summedResults?.forEach((student) => studentIds.add(student.studentId));
        });

        const teaching = new Map(
            buildSurveyHistory(this.history, 'tq_mean', {
                subject: domainGroup?.[0]?.fach,
                studentIds,
            }).map((slice) => [slice.year, slice]),
        );
        const selfEfficacy = new Map(
            buildSurveyHistory(this.history, 'sp_mean').map((slice) => [slice.year, slice]),
        );

        const timeline = [];
        for (const year of buildYearAxis(this.history)) {
            const tqSlice = teaching.get(year);
            const spSlice = selfEfficacy.get(year);
            if (!tqSlice || !spSlice) continue;

            const tqStats = calculateDetailedBoxPlotStats(tqSlice.values);
            const spStats = calculateDetailedBoxPlotStats(spSlice.values);
            if (!tqStats || !spStats) continue;

            timeline.push({
                year,
                measured: tqSlice.measured,
                teachingQuality: tqStats,
                selfEfficacy: spStats,
            });
        }
        return timeline;
    }

    renderChart() {
        this.clearContainer();

        const historicalData = this.getTimeline();
        if (historicalData.length === 0) {
            this.showNoDataMessage();
            return;
        }

        // The axis spans exactly the years the payload delivered — no hardcoded window.
        const years = historicalData.map((entry) => entry.year);

        // Measure axis space
        this.calculateDimensions();

        const axisLeftSpace = measureRatingAxisSpace(this, 'left', {
            axisTitleText: 'Unterrichtsqualität',
        });
        const axisBottomSpace = measureCategoryAxisSpace(this, 'bottom', years, {
            axisTitleText: 'Jahr',
        });
        const axisRightSpace = measureEdgeTickReserve(this, [years[years.length - 1]], {
            fontFamily: this.getChartFont(),
        });

        const {
            svg,
            g: chartGroup,
            layout,
        } = this.initializeSVG({
            axisOverrides: {
                left: axisLeftSpace,
                bottom: axisBottomSpace,
                right: axisRightSpace,
            },
            legendConfigs: [],
        });

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        // Create scales
        const xScale = d3.scalePoint().domain(years).range([0, chartWidth]).padding(0.3);

        // Y-scales for both metrics (1-5)
        const yScaleTeaching = d3
            .scaleLinear()
            .domain([1, 5])
            .range([chartHeight * 0.4, 0]);

        const yScaleSelfEfficacy = d3
            .scaleLinear()
            .domain([1, 5])
            .range([chartHeight, chartHeight * 0.55]);

        // Add Y-axis for Teaching Quality
        chartGroup
            .append('g')
            .attr('class', 'y-axis-teaching')
            .call(createRatingAxis('left', yScaleTeaching));

        // Add Y-axis label for Teaching Quality
        chartGroup
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -(chartHeight * 0.2))
            .attr('y', -(layout.axes.left - 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', 'var(--fw-semibold)')
            .style('fill', getThemeColors().sl.teachingQuality)
            .text('Unterrichtsqualität');

        // Add Y-axis for Self-Efficacy
        chartGroup
            .append('g')
            .attr('class', 'y-axis-self-efficacy')
            .call(createRatingAxis('left', yScaleSelfEfficacy));

        // Add Y-axis label for Self-Efficacy
        chartGroup
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -(chartHeight * 0.775))
            .attr('y', -(layout.axes.left - 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', 'var(--fw-semibold)')
            .style('fill', getThemeColors().sl.selfEfficacy)
            .text('Selbstwirksamkeit');

        // Add X-axis
        const xAxis = d3.axisBottom(xScale);

        chartGroup
            .append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(xAxis);

        // Add X-axis label
        this.renderAxisTitle(chartGroup, 'bottom', 'Jahr', {
            fontWeight: 'var(--fw-semibold)',
            fill: getThemeColors().chrome.text,
        });

        // Create gradients for both metrics (before drawing box plots)
        svg.select('defs').remove();
        const defs = svg.append('defs');

        const colors = getThemeColors();
        appendBoxGradient(defs, `box-gradient-teachingQuality-${this.containerId}`, {
            color: colors.sl.teachingQuality,
            endOpacity: 0.5,
        });
        appendBoxGradient(defs, `box-gradient-selfEfficacy-${this.containerId}`, {
            color: colors.sl.selfEfficacy,
            endOpacity: 0.5,
        });

        // Dynamic box width — scales with chart but caps at 60px
        const boxWidth = Math.min(xScale.step() * 0.5, 60);

        // Draw box plots and connecting lines
        this.drawBoxPlotsWithLines(
            svg,
            chartGroup,
            historicalData,
            xScale,
            yScaleTeaching,
            'teachingQuality',
            colors.sl.teachingQuality,
            boxWidth,
        );
        this.drawBoxPlotsWithLines(
            svg,
            chartGroup,
            historicalData,
            xScale,
            yScaleSelfEfficacy,
            'selfEfficacy',
            colors.sl.selfEfficacy,
            boxWidth,
        );
    }

    /**
     * Draws box plots with connecting lines
     * @param {object} svg - D3 SVG selection
     * @param {object} chartGroup - D3 chart group selection
     * @param {Array} historicalData - Historical data array
     * @param {Function} xScale - X scale function
     * @param {Function} yScale - Y scale function
     * @param {string} dataKey - Data key ('teachingQuality' or 'selfEfficacy')
     * @param {string} color - Color for the box plots
     * @param {number} boxWidth - Box width in px.
     */
    drawBoxPlotsWithLines(
        svg,
        chartGroup,
        historicalData,
        xScale,
        yScale,
        dataKey,
        color,
        boxWidth,
    ) {
        const capWidth = boxWidth * WHISKER_CAP_WIDTH_RATIO;
        const gradientId = `box-gradient-${dataKey}-${this.containerId}`;

        // Draw each box plot
        historicalData.forEach((yearData) => {
            const data = yearData[dataKey];
            const x = xScale(yearData.year);

            const metricLabel =
                dataKey === 'teachingQuality'
                    ? 'Unterrichtsqualität (kogn. Aktivierung)'
                    : 'Selbstwirksamkeit';
            const isCurrentYear = yearData.measured === true;

            // Create shared tooltip data object for this box plot
            const tooltipData = { yearData, data, metricLabel, isCurrentYear };

            const { whisker, caps, box, median, mean, outliers } = drawBoxPlotFigure(
                chartGroup,
                data,
                {
                    centerX: x,
                    boxWidth,
                    capWidth,
                    yScale,
                    color,
                    fill: `url(#${gradientId})`,
                    datum: tooltipData,
                },
            );

            box.attr('fill-opacity', 1);

            this.wireBoxTooltip(whisker);
            caps.forEach((cap) => this.wireBoxTooltip(cap));
            this.wireBoxTooltip(box, {
                enter: { 'fill-opacity': 0.7 },
                leave: { 'fill-opacity': 1 },
            });
            this.wireBoxTooltip(median);
            this.wireBoxTooltip(mean, {
                enter: { fill: color, 'fill-opacity': 0.3 },
                leave: { fill: getThemeColors().chrome.surface, 'fill-opacity': 1 },
            });
            if (outliers) this.wireBoxTooltip(outliers);
        });

        // Draw connecting lines between boxes at median height
        for (let i = 0; i < historicalData.length - 1; i++) {
            const currentYear = historicalData[i];
            const nextYear = historicalData[i + 1];

            const x1 = xScale(currentYear.year) + boxWidth / 2;
            const x2 = xScale(nextYear.year) - boxWidth / 2;
            const y1 = yScale(currentYear[dataKey].median);
            const y2 = yScale(nextYear[dataKey].median);

            chartGroup
                .append('line')
                .attr('x1', x1)
                .attr('x2', x2)
                .attr('y1', y1)
                .attr('y2', y2)
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('opacity', 0.6)
                .attr('class', `median-connector-${dataKey}`);
        }
    }

    /**
     * Wire the shared box-plot tooltip (data carried on each element's datum via
     * `.datum(tooltipData)`) plus an optional hover effect.
     * @param {d3.Selection} selection - The elements to make hoverable.
     * @param {object} [hoverEffect] - Extra styling applied while hovered.
     */
    wireBoxTooltip(selection, hoverEffect) {
        this.wireTooltipEvents(selection, {
            getTooltipContent: (d) =>
                this.formatTooltipContent(
                    { yearData: d.yearData, data: d.data },
                    { metricLabel: d.metricLabel, isCurrentYear: d.isCurrentYear },
                ),
            tooltipId: 'longitudinal-boxplot',
            ...(hoverEffect ? { hoverEffect } : {}),
        });
    }

    // Note: Tooltip cleanup is automatic via chartState.tooltipIds tracking
}
