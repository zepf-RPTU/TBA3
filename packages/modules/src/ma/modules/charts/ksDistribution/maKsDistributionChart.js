/**
 * MaKsDistributionChart - MA-specific KS Distribution Chart
 * Shows KS distribution for comparison groups sourced from the API.
 *
 * Features:
 * - Horizontal/Vertical orientation toggle
 * - Comparison-group visibility driven by the app's shared comparison state
 *   (`activeModes` in reactive state; the ⌀ dropdown in the module header writes it)
 * - Segment click filtering
 */

import { BaseKsDistributionChartRenderer } from '../../../../common/charts/ksDistribution/baseKsDistributionChartRenderer.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    getResponsiveTickCount,
    measureCategoryAxisSpace,
    measurePercentEdgeTickReserve,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import {
    measureExtraLabelLineSpace,
    splitLabelLines,
    wrapBandAxisTickLabels,
} from '../../../../common/charts/chartLabelFit.js';
import * as d3 from 'd3';
import { initialActiveModes } from '../../../../common/charts/comparisonState.js';

/**
 * Layout preset for MA's Kompetenzstufen chart: no legend, plus room on the right so
 * the last bar's label is not clipped.
 * @returns {object} The layout config handed to the renderer.
 */
function createKsDistributionLayout() {
    return chartLayoutPreset('noLegend', { padding: { right: 10 } });
}

// ============================================================================
// MA KS DISTRIBUTION CHART CLASS
// ============================================================================

/**
 * MA-specific stacked bar chart for KS distribution
 * @augments BaseKsDistributionChartRenderer
 */
export class MaKsDistributionChart extends BaseKsDistributionChartRenderer {
    /**
     * Creates a new MA MaKsDistributionChart instance
     * @param {string} containerId - Container element ID
     * @param {object} levelColors - Object mapping levels to colors
     * @param {object} options - Configuration options
     */
    constructor(containerId, levelColors, options = {}) {
        super(containerId, levelColors, {
            layout: createKsDistributionLayout(),
            ...options,
        });

        this.enableSegmentClick = options.enableSegmentClick !== false;
    }

    // ============================================================================
    // REACTIVE STATE
    // ============================================================================

    getInitialState() {
        return {
            activeModes: initialActiveModes(this.options),
            highlightedLevel: this.options.highlightedLevel ?? null,
            isHorizontal: this.options.isHorizontal ?? false,
        };
    }

    /**
     * Current orientation. Reactive — change via `setState({ isHorizontal })`
     * so the chart re-renders; the config persists the value on the host for
     * rebuilds (theme change re-creates the chart).
     * @returns {boolean} True when the bars run horizontally.
     */
    get isHorizontal() {
        return this._state.isHorizontal;
    }

    _onStateChanged(changedKeys, _prevState) {
        if (changedKeys.includes('highlightedLevel') && changedKeys.length === 1) {
            this.updateHighlightedLevel(this._state.highlightedLevel, false);
            return;
        }
        if (changedKeys.includes('activeModes')) {
            this.syncVisibleGroups(this._state.activeModes);
        }
        this.refresh();
    }

    /**
     * Render the chart
     * @override
     */
    async renderChart() {
        // Pre-compute dimensions for axis measurement
        this.calculateDimensions();

        const groupNames = this.groupNames;

        // Measure axis space based on orientation
        let axisOverrides;
        if (this.isHorizontal) {
            // Horizontal: groups on left y-axis, percentages on bottom x-axis
            const leftSpace = measureCategoryAxisSpace(this, 'left', groupNames);
            const bottomSpace = measurePercentAxisSpace(this, 'bottom', {
                axisTitleText: `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`,
            });
            // Reserve space for "100%" label extending past the right edge
            const rightSpace = measurePercentEdgeTickReserve(this, { buffer: 2 });
            axisOverrides = { left: leftSpace, bottom: bottomSpace, right: rightSpace };
        } else {
            // Vertical: groups on bottom x-axis, percentages on left y-axis.
            // Free-text names wrap over up to two lines (`splitLabelLines`), so
            // the reserve measures the lines that will actually be drawn plus
            // the second line's height when any name needs it.
            const leftSpace = measurePercentAxisSpace(this, 'left', {
                axisTitleText: `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`,
            });
            const bottomSpace =
                measureCategoryAxisSpace(this, 'bottom', groupNames.flatMap(splitLabelLines)) +
                measureExtraLabelLineSpace(this.resolveChartTextSize('base'), groupNames);
            axisOverrides = { left: leftSpace, bottom: bottomSpace };
        }

        const { svg, g, dimensions } = this.initializeSVG({
            axisOverrides,
            legendConfigs: [],
        });

        this.svg = svg;
        this.mainGroup = g;
        this.dimensions = dimensions;

        let data = this.prepareChartDataFromApi();

        const { xScale, yScale } = this.createScales(this.dimensions);

        // Drop the hidden groups so no remnant bars are rendered at position 0
        if (this.visibleGroups.size < this.groupNames.length) {
            data = data.filter((d) => this.visibleGroups.has(d.group));
        }

        this.createAxes(g, xScale, yScale, this.dimensions);
        this.createStackedBars(g, data, xScale, yScale, this.dimensions);
    }

    /**
     * Create scales for chart
     * @param {object} dimensions - Chart dimensions
     * @returns {{xScale: d3.ScaleBand<string>, yScale: d3.ScaleLinear<number, number>}} Band scale for the groups and linear scale for the percentages, swapped by orientation.
     * @private
     */
    createScales(dimensions) {
        const visibleGroups = this.groupNames.filter((name) => this.visibleGroups.has(name));
        const { xScale, yScale } = this._createBandLinearScales({
            visibleGroups,
            dimensions,
            isHorizontal: this.isHorizontal,
        });
        return { xScale, yScale };
    }

    /**
     * Create axes
     * @param {object} g - D3 selection for main group
     * @param {d3.ScaleBand<string>} xScale - D3 band scale for the groups
     * @param {d3.ScaleLinear<number, number>} yScale - D3 linear scale for the percentages
     * @param {object} dimensions - Chart dimensions
     * @private
     */
    createAxes(g, xScale, yScale, dimensions) {
        const tickCount = getResponsiveTickCount(dimensions);

        if (this.isHorizontal) {
            // Horizontal mode
            g.append('g')
                .attr('class', 'x-axis')
                .attr('transform', `translate(0,${dimensions.chartHeight})`)
                .call(createPercentAxis('bottom', yScale, { ticks: tickCount }));

            g.append('g').attr('class', 'y-axis').call(d3.axisLeft(xScale));

            this.renderAxisTitle(g, 'bottom', `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`, {
                fontWeight: 'bold',
                className: 'axis-label',
            });
        } else {
            // Vertical mode
            const xAxisGroup = g
                .append('g')
                .attr('class', 'x-axis')
                .attr('transform', `translate(0,${dimensions.chartHeight})`)
                .call(d3.axisBottom(xScale));

            // Free-text group names wrap and fit into the band step; short
            // names stay untouched.
            wrapBandAxisTickLabels(this, xAxisGroup, xScale.step());

            g.append('g')
                .attr('class', 'y-axis')
                .call(createPercentAxis('left', yScale, { ticks: tickCount }));

            this.renderAxisTitle(g, 'left', `Anteil der ${TERM_CONSTANTS.STUDENTS} (%)`, {
                fontWeight: 'bold',
                className: 'axis-label',
            });
        }
    }

    /**
     * Create stacked bars
     * @param {object} g - D3 selection for main group
     * @param {Array} data - Prepared chart data, one row per group with its own counts and total
     * @param {d3.ScaleBand<string>} xScale - D3 band scale for the groups
     * @param {Function} yScale - D3 linear scale for the percentages
     * @param {object} dimensions - Chart dimensions
     * @private
     */
    createStackedBars(g, data, xScale, yScale, dimensions) {
        this.createStackedBarsBase(g, data, xScale, yScale, dimensions, {
            isHorizontal: this.isHorizontal,
            segmentClickEnabled: this.enableSegmentClick,
            getTransform: (d) =>
                this.isHorizontal
                    ? `translate(0,${xScale(d.group)})`
                    : `translate(${xScale(d.group)},0)`,
        });
    }
}
