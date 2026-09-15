/**
 * EnKsDistributionChart - EN-specific KS Distribution Chart
 * Shows GER level distribution for comparison groups: Class, School, State
 *
 * Features:
 * - Optimized visibility updates without full redraw
 * - Visibility driven by the app's comparison state (`activeModes` in reactive state)
 */

import { BaseKsDistributionChartRenderer } from '../../../../common/charts/ksDistribution/baseKsDistributionChartRenderer.js';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { motionDuration } from '../../../../common/charts/motionPreference.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    getResponsiveTickCount,
    measureCategoryAxisSpace,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import {
    measureExtraLabelLineSpace,
    splitLabelLines,
    wrapBandAxisTickLabels,
} from '../../../../common/charts/chartLabelFit.js';
import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';
import { isComparisonValueGroup } from '../../../../common/domain/comparisonGroupLabels.js';
import { comparisonSeriesVisual } from '../../../../common/charts/comparisonSeries.js';
import * as d3 from 'd3';
import { initialActiveModes } from '../../../../common/charts/comparisonState.js';

// ============================================================================
// EN KS DISTRIBUTION CHART CLASS
// ============================================================================

/**
 * EN-specific stacked bar chart for GER level distribution
 * @augments BaseKsDistributionChartRenderer
 */
export class EnKsDistributionChart extends BaseKsDistributionChartRenderer {
    /** @type {Map<string, string|null>|null} */
    #nameToGlossaryKey = null;

    /**
     * Creates a new EN EnKsDistributionChart instance
     * @param {string} containerId - Container element ID
     * @param {object} levelColors - Object mapping levels to colors
     * @param {{[key: string]: any}} [options={}] - Configuration options (apiData, yAxisSide, enableSegmentClick, …)
     */
    constructor(containerId, levelColors, options = {}) {
        const yAxisSide = options.yAxisSide || 'left';

        super(
            containerId,
            levelColors,
            /** @type {any} */ ({
                layout: chartLayoutPreset('noLegend'),
                ...options,
            }),
        );

        this.yAxisSide = yAxisSide;
        this.enableSegmentClick = options.enableSegmentClick !== false;
        this.onParsedDataUpdated();
    }

    // ============================================================================
    // REACTIVE STATE
    // ============================================================================

    getInitialState() {
        const activeComparisons = initialActiveModes(this.options);
        return {
            activeModes: activeComparisons,
            highlightedLevel: this.options.highlightedLevel ?? null,
        };
    }

    _onStateChanged(changedKeys, _prevState) {
        if (changedKeys.includes('activeModes') && !changedKeys.includes('highlightedLevel')) {
            this.syncVisibleGroups(this._state.activeModes);
            this.updateGroupVisibility();
            return;
        }

        if (changedKeys.includes('highlightedLevel') && !changedKeys.includes('activeModes')) {
            this.updateHighlightedLevel(this._state.highlightedLevel, false);
            return;
        }

        this.refresh();
    }

    onParsedDataUpdated() {
        // The term follows the row's `type`, as on every EN comparison chart: the
        // class's own row is the Klassenschnitt, a comparison row takes its role's
        // term, and a population the glossary has no term for gets none — its own
        // name is then the whole label, never a borrowed Klassenschnitt. The cast is
        // sound: `comparisonSeriesVisual` reads only `type`, not the ordinal fields.
        this.#nameToGlossaryKey = new Map(
            this.parsedApiData.groups.map((group) => [
                group.name,
                isComparisonValueGroup(group)
                    ? comparisonSeriesVisual(/** @type {any} */ (group)).glossaryKey
                    : GLOSSARY_KEYS.KLASSENSCHNITT,
            ]),
        );
    }

    /**
     * Render the chart
     * @override
     */
    async renderChart() {
        // Pre-compute dimensions for axis measurement
        this.calculateDimensions();
        const chartFontSize = this.getChartTextMeasureSize();
        const yAxisSafetyPad = 10;
        const minYAxisSpace = Math.max(48, chartFontSize * 3.2);

        // Measure axis space
        const axisSide = this.yAxisSide === 'right' ? 'right' : 'left';
        const measuredYAxisSpace = measurePercentAxisSpace(this, axisSide);
        const yAxisSpace = Math.max(minYAxisSpace, measuredYAxisSpace + yAxisSafetyPad);

        // X-axis: group names. Free-text names wrap over up to two lines
        // (`splitLabelLines`), so the reserve measures the lines that will
        // actually be drawn plus the second line's height when any name needs it.
        const allGroupNames = this.groupNames;
        const axisBottomSpace =
            measureCategoryAxisSpace(this, 'bottom', allGroupNames.flatMap(splitLabelLines)) +
            measureExtraLabelLineSpace(this.resolveChartTextSize('base'), allGroupNames);

        const axisOverrides = {
            bottom: axisBottomSpace,
            [axisSide]: yAxisSpace,
        };

        const { svg, g, dimensions } = this.initializeSVG({
            axisOverrides,
            legendConfigs: [],
        });

        this.svg = svg;
        this.mainGroup = g;
        this.dimensions = dimensions;

        const data = this.prepareChartDataFromApi();

        const { xScale, yScale } = this.createScales(this.dimensions);

        this.createAxes(svg, g, xScale, yScale, this.dimensions);
        this.createStackedBars(g, data, xScale, yScale, this.dimensions);
    }

    /**
     * Update visibility of bar groups without full chart refresh
     * @private
     */
    updateGroupVisibility() {
        if (!this.svg || !this.mainGroup || !this.dimensions) return;

        const transitionDuration = motionDuration(ChartRenderer.TRANSITION_DURATION);
        const visibleGroups = this.groupNames.filter((name) => this.visibleGroups.has(name));

        const { xScale } = this._createBandLinearScales({
            visibleGroups,
            dimensions: this.dimensions,
        });

        const barGroups = this.mainGroup.selectAll('g.bar-group');

        barGroups.each((d, i, nodes) => {
            const barGroup = d3.select(nodes[i]);
            const isVisible = this.visibleGroups.has(d.group);

            if (isVisible) {
                const newX = xScale(d.group);
                const newWidth = xScale.bandwidth();

                barGroup
                    .style('display', null)
                    .transition()
                    .duration(transitionDuration)
                    .attr('transform', `translate(${newX},0)`)
                    .style('opacity', 1);

                barGroup
                    .selectAll('rect')
                    .transition()
                    .duration(transitionDuration)
                    .attr('width', newWidth);

                barGroup
                    .selectAll('text')
                    .transition()
                    .duration(transitionDuration)
                    .attr('x', newWidth / 2);
            } else {
                barGroup
                    .transition()
                    .duration(transitionDuration)
                    .style('opacity', 0)
                    .on('end', function () {
                        d3.select(this).style('display', 'none');
                    });
            }
        });

        // Update x-axis labels
        const xAxisGroup = this.mainGroup.select('.x-axis');
        xAxisGroup
            .transition()
            .duration(transitionDuration)
            .call(d3.axisBottom(xScale))
            // The axis writes each tick's plain, single-line name when the
            // transition starts, so the wrap and fit have to be re-applied once
            // it has finished — otherwise a toggle puts free-text group names
            // back on one overlapping line.
            .on('end', () => wrapBandAxisTickLabels(this, xAxisGroup, xScale.step()));
        this.normalizeSvgTypography(xAxisGroup);
        xAxisGroup.selectAll('text').each((d, i, nodes) => {
            const glossaryKey = this.#nameToGlossaryKey?.get(d);
            if (glossaryKey) this.stampGlossaryAttr(d3.select(nodes[i]), glossaryKey);
        });
    }

    /**
     * Create scales for chart
     * @param {object} dimensions - Chart dimensions
     * @returns {{xScale: d3.ScaleBand<string>, yScale: d3.ScaleLinear<number, number>}} The scales the bars are drawn against; the full-width band scale is kept on the instance so hidden groups keep their slot during transitions.
     * @private
     */
    createScales(dimensions) {
        const visibleGroups = this.groupNames.filter((name) => this.visibleGroups.has(name));
        const { xScale, yScale, fullXScale } = this._createBandLinearScales({
            visibleGroups,
            dimensions,
            allGroups: this.groupNames, // full scale positions hidden groups during transitions
        });
        this.fullXScale = fullXScale;
        return { xScale, yScale };
    }

    /**
     * Create axes with y-axis position support
     * @param {object} svg - D3 selection for the chart root
     * @param {object} g - D3 selection for main group
     * @param {d3.ScaleBand<string>} xScale - D3 band scale for x-axis
     * @param {d3.ScaleLinear<number, number>} yScale - D3 linear scale for y-axis
     * @param {object} dimensions - Chart dimensions
     * @private
     */
    createAxes(svg, g, xScale, yScale, dimensions) {
        const tickCount = getResponsiveTickCount(dimensions);

        // X-axis (bottom)
        const xAxisGroup = g
            .append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${dimensions.chartHeight})`)
            .call(d3.axisBottom(xScale));

        xAxisGroup.selectAll('text').each((d, i, nodes) => {
            const glossaryKey = this.#nameToGlossaryKey?.get(d);
            if (glossaryKey) this.stampGlossaryAttr(d3.select(nodes[i]), glossaryKey);
        });

        // Free-text group names wrap and fit into the band step; short names
        // stay untouched.
        wrapBandAxisTickLabels(this, xAxisGroup, xScale.step());

        // Y-axis (left or right)
        if (this.yAxisSide === 'right') {
            g.append('g')
                .attr('class', 'y-axis')
                .attr('transform', `translate(${dimensions.chartWidth},0)`)
                .call(createPercentAxis('right', yScale, { ticks: tickCount }));
        } else {
            g.append('g')
                .attr('class', 'y-axis')
                .call(createPercentAxis('left', yScale, { ticks: tickCount }));
        }
    }

    /**
     * Create stacked bars
     * @param {object} g - D3 selection for main group
     * @param {Array} data - Prepared chart data, one row per group with its own counts and total
     * @param {d3.ScaleBand<string>} xScale - D3 band scale for x-axis
     * @param {Function} yScale - D3 linear scale for y-axis
     * @param {object} dimensions - Chart dimensions
     * @private
     */
    createStackedBars(g, data, xScale, yScale, dimensions) {
        this.createStackedBarsBase(g, data, xScale, yScale, dimensions, {
            isHorizontal: false,
            segmentClickEnabled: this.enableSegmentClick,
            getTransform: (d) => {
                const x = this.visibleGroups.has(d.group)
                    ? xScale(d.group)
                    : this.fullXScale(d.group);
                return `translate(${x},0)`;
            },
            getOpacity: (d) => (this.visibleGroups.has(d.group) ? 1 : 0),
            getDisplay: (d) => (this.visibleGroups.has(d.group) ? null : 'none'),
        });
    }
}
