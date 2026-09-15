/**
 * Simple Horizontal Stacked Bar Chart for KS Distribution
 * Shows only a single horizontal stacked bar without axes, legend, or other elements
 * Extends BarChartRenderer for stacked bar and tooltip support
 */

import {
    BarChartRenderer,
    createSVGStackedBar,
    STACKED_BAR_CHART_DEFAULTS,
} from '../../../../common/charts/renderers/barChartRenderer.js';
import {
    buildStackedSegments,
    levelShareLabelFormatter,
} from '../../../../common/charts/stackedBarUtils.js';
import { sortCompetencyLevels } from '../../../../common/charts/chartUtils.js';
import { chartLayoutPreset, createPercentAxis } from '../../../../common/charts/chartAxisUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import * as d3 from 'd3';

/** Space under the bar for the percent ruler, px. */
const RULER_SPACE = 24;

/**
 * Simple stacked bar chart showing KS distribution as a single horizontal bar
 * @augments BarChartRenderer
 */
class SimpleKsBarChart extends BarChartRenderer {
    constructor(containerId, ksDistribution, levelColors, options = {}) {
        super(containerId, {
            defaultWidth: 600,
            defaultHeight: 80,
            animationDuration: 200,
            layout: chartLayoutPreset('noLegend', {
                // The side padding holds the ruler's edge labels (`0 %`, `100 %`).
                padding: { top: 10, right: 20, bottom: 6, left: 20 },
            }),
            ...options,
        });

        // Store all cleanable state in chartState for automatic cleanup
        this.chartState.distribution = ksDistribution; // Object with KS levels as keys and percentages as values
        this.chartState.colors = levelColors; // Object mapping KS levels to colors
        this.chartState.highlight = options.highlightedLevel || null; // Currently highlighted level
        this.chartState.onLevelClick = options.onLevelClick || null; // Callback for level clicks
        this.chartState.counts = options.ksCounts || {}; // Object with absolute student counts per KS level
    }

    // ============================================================================
    // LIFECYCLE METHODS
    // ============================================================================

    validateData() {
        if (
            !this.chartState.distribution ||
            Object.keys(this.chartState.distribution).length === 0
        ) {
            console.warn('No KS distribution data available');
            return false;
        }
        return true;
    }

    async renderChart() {
        const { svg, g, dimensions, layout } = this.initializeSVG({
            axisOverrides: { bottom: RULER_SPACE },
            legendConfigs: [],
        });

        this.svg = svg;
        this.mainGroup = g;

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        const segments = this.prepareStackedData();

        const xScale = d3.scaleLinear().domain([0, 100]).range([0, chartWidth]);

        // Patch dimensions for createStackedBar compatibility
        this.createStackedBar(g, segments, xScale, {
            ...dimensions,
            chartWidth,
            chartHeight,
        });
        this.#renderRuler(g, xScale, chartHeight);
    }

    /**
     * The hairline percent ruler under the bar: a click on a segment filters the
     * table by a share, and the ruler is what makes the segment read as one.
     * @param {d3.Selection} g - The plot group.
     * @param {d3.ScaleLinear<number, number>} xScale - Percent → px.
     * @param {number} chartHeight - The bar's height, where the ruler sits.
     */
    #renderRuler(g, xScale, chartHeight) {
        const colors = getThemeColors();
        const axis = g
            .append('g')
            .attr('class', 'simple-ks-bar-ruler')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(createPercentAxis('bottom', xScale, { step: 20 }));
        axis.select('.domain').attr('stroke', colors.chrome.border);
        axis.selectAll('.tick line').attr('stroke', colors.chrome.border);
        axis.selectAll('text').attr('fill', colors.chrome.textSecondary);
        this.normalizeSvgTypography(axis, { textSize: 'sm' });
    }

    // ============================================================================
    // TOOLTIP CONTENT
    // ============================================================================

    /**
     * Format tooltip content for a bar segment
     * @override
     * @param {object} segment - The segment data
     * @param {object} _context - Additional context (unused)
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, _context = {}) {
        const percentage = segment.value.toFixed(1);
        const count = segment.count;
        return this.buildTooltipHTML({
            title: `KS ${segment.label}`,
            rows: [
                { label: 'Anteil', value: `${percentage}%` },
                {
                    label: 'Anzahl',
                    value: `${count} ${count === 1 ? TERM_CONSTANTS.STUDENT : TERM_CONSTANTS.STUDENTS}`,
                },
            ],
        });
    }

    // ============================================================================
    // DATA PROCESSING
    // ============================================================================

    prepareStackedData() {
        // Scale order, not alphabetical: MA loads one state's export per class and those
        // ladders do not sort into place on their own — `k.h.N.` lands after `KS 5` and
        // `OptStd` between `MiStd--` and `ReStd`, giving a stacked bar whose segments are
        // in the wrong order and which looks entirely normal.
        const levels = sortCompetencyLevels(Object.keys(this.chartState.distribution));

        return buildStackedSegments(
            this.chartState.distribution,
            levels,
            (level) => this.chartState.colors[level] || getThemeColors().chrome.defaultBarColor,
        ).map((segment) => ({
            ...segment,
            key: segment.field,
            count: this.chartState.counts[segment.field] || 0,
        }));
    }

    // ============================================================================
    // CHART COMPONENTS
    // ============================================================================

    createStackedBar(g, segments, xScale, dimensions) {
        const barHeight = dimensions.chartHeight;
        const chartInstance = this;

        // Use unified stacked bar utility with horizontal linear scale and modern tooltip approach
        createSVGStackedBar(
            g,
            segments,
            {
                xScale: xScale,
                barHeight: barHeight,
                isHorizontal: true,
                barGroupClass: 'simple-ks-bar',
                highlightedKey: this.chartState.highlight,
                fillOpacity: STACKED_BAR_CHART_DEFAULTS.STYLES.FILL_OPACITY_DEFAULT,
                cursor: 'pointer',

                // Modern tooltip approach using wireTooltipEvents
                getTooltipContent: (segment) => chartInstance.formatTooltipContent(segment),
                hoverOpacity: STACKED_BAR_CHART_DEFAULTS.STYLES.FILL_OPACITY_HOVER,

                // Click handler for toggling selection
                onClick: (event, segment) => {
                    const newLevel = chartInstance.toggleHighlightKey(
                        chartInstance.chartState.highlight,
                        segment.key ?? segment.field,
                    );
                    chartInstance.updateHighlightedLevel(newLevel);

                    if (chartInstance.chartState.onLevelClick) {
                        chartInstance.chartState.onLevelClick(newLevel);
                    }
                },

                // Label configuration
                showLabels: true,
                minLabelWidth: 30,
                labelColor: getThemeColors().chrome.chartLabelFill,
                // `III · 36 % (9)` when the segment holds it, the level alone otherwise.
                labelFormatter: (segment, tier) =>
                    tier?.withShare
                        ? `${levelShareLabelFormatter(segment, tier)} (${segment.count ?? 0})`
                        : levelShareLabelFormatter(segment),
            },
            chartInstance,
        ); // Pass chartInstance for wireTooltipEvents support
    }

    /**
     * Updates the highlighted competency level
     * @param {string|null} level - Competency level to highlight or null to clear
     */
    updateHighlightedLevel(level) {
        this.chartState.highlight = level;

        if (!this.svg) {
            this.refresh();
            return;
        }

        this.updateHighlightVisuals(level);
    }

    /**
     * Update highlight styling in place without rebuilding the SVG.
     * @param {string|null} level - Competency level to highlight or null to clear
     */
    updateHighlightVisuals(level) {
        if (!this.svg) return;

        this.svg.selectAll('.simple-ks-bar .bar-segment').each((d, i, nodes) => {
            const segment = d3.select(nodes[i]);
            const segmentLevel = segment.attr('data-level') || segment.attr('data-field');
            const isHighlighted = Boolean(level) && segmentLevel === level;
            this.applyHighlightStroke(segment, isHighlighted);
        });
    }
}

export { SimpleKsBarChart };
