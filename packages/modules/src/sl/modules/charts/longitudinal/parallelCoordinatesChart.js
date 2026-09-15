/**
 * Parallel Coordinates Chart for Timeline Data Visualization
 * Generalized to handle arbitrary timeline data with variable years
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';

import {
    chartLayoutPreset,
    createPercentAxis,
    formatPercentTick,
    measureCategoryAxisSpace,
    measureEdgeTickReserve,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { AXIS_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import {
    motionDuration,
    prefersReducedMotion,
} from '../../../../common/charts/motionPreference.js';
import { getCompetencyColor, getThemeColors } from '../../../../common/services/themeService.js';
import { spreadLabelPositions } from '../../../../common/charts/chartLabelFit.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import * as d3 from 'd3';

/**
 * ParallelCoordinatesChart - Timeline visualization extending ChartRenderer
 * Displays data trends across multiple time periods with optional stacked view
 *
 * Every series carries a direct label at its right end in both modes.
 */
export class ParallelCoordinatesChart extends ChartRenderer {
    // Visual constants
    static SCALE_PADDING = 0.1;
    static LINE_STROKE_WIDTH = 2.5;
    static DOT_RADIUS_DEFAULT = 4;
    static DOT_RADIUS_HOVER = 6;
    static AREA_OPACITY = 0.7;
    static LINE_OPACITY = 0.8;
    static TICK_INTERVAL = 10;
    static LEGEND_SYMBOL_TEXT_GAP = 8;
    static LEGEND_COLUMN_GAP = 18;
    static LEGEND_SLOT_BUFFER = 16;
    static END_LABEL_GAP = 6;
    /** @type {'sm'|'base'|'lg'} */
    static LEGEND_TEXT_SIZE = 'sm';
    /** @type {'sm'|'base'|'lg'} */
    static END_LABEL_TEXT_SIZE = 'sm';

    /**
     * Shape of a single line/area point produced by {@link ParallelCoordinatesChart#getLineData}.
     * `base` is present only in stacked mode.
     * @typedef {{year: string, measured: boolean, value: number, base?: number}} LineDataPoint
     */

    /** @type {import('d3').ScalePoint<string>} */
    xScale;
    /** @type {import('d3').ScaleLinear<number, number>} */
    yScale;
    dotRadius = ParallelCoordinatesChart.DOT_RADIUS_DEFAULT;
    dotRadiusHover = ParallelCoordinatesChart.DOT_RADIUS_HOVER;

    constructor(containerId, timelineData, options = {}) {
        super(containerId, {
            ...options,
            layout: chartLayoutPreset('bottomLegend', {
                legends: [{ position: 'bottom', gap: 8 }],
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
            }),
        });

        // Timeline data structure:
        // [{
        //   year: '2021',
        //   categories: { 'category1': value1, 'category2': value2, ... }
        // }, ...]
        this.timelineData = timelineData;

        // Options
        this.categoryLabels = options.categoryLabels || {}; // Map of category keys to display labels
        this.categoryColors = options.categoryColors || {}; // Map of category keys to colors
        this.categoryOrder = options.categoryOrder || null; // Optional array defining category order
        this.categoryPrefix = options.categoryPrefix ?? 'KS'; // Prefix for category labels (e.g., 'KS', 'Bereich', '')
        this.yAxisLabel = options.yAxisLabel || `Anteil ${TERM_CONSTANTS.STUDENTS} (%)`;
        this.initialStacked = options.initialStacked || false;
        // A y maximum handed in by the view so sibling cards share one scale; without
        // it the chart scales to its own data.
        this.yMax = Number.isFinite(options.yMax) ? options.yMax : null;

        // State
        this.isStacked = this.initialStacked;
        this.categories = this.#extractCategories();

        // Store all cleanable cached values in chartState for automatic cleanup
        this.chartState.cache = {
            years: null,
            maxValue: null,
        };
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    getInitialState() {
        return { isStacked: this.isStacked };
    }

    _onStateChanged(changedKeys, _prevState) {
        if (changedKeys.includes('isStacked') && changedKeys.length === 1) {
            this.setViewMode(this._state.isStacked);
            return;
        }
        this.refresh();
    }

    validateData() {
        if (!Array.isArray(this.timelineData) || this.timelineData.length === 0) {
            return false;
        }

        // Validate structure
        for (let idx = 0; idx < this.timelineData.length; idx++) {
            const entry = this.timelineData[idx];
            if (!entry.year) {
                console.error(`Timeline entry ${idx} missing 'year' property`);
                return false;
            }
            if (!entry.categories || typeof entry.categories !== 'object') {
                console.error(`Timeline entry ${idx} missing or invalid 'categories' property`);
                return false;
            }
        }

        return true;
    }

    /**
     * Format tooltip content for timeline data points
     * @param {object} segment - Data point with year, value, category
     * @param {object} context - Context with category info
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        const { category } = context;
        return this.buildTooltipHTML({
            title: null,
            rows: [
                {
                    label: 'Jahr',
                    value: segment.measured ? `${segment.year} (aktuell)` : segment.year,
                },
                {
                    label: this.#getCategoryLabel(category),
                    value: segment.value.toFixed(1) + '%',
                },
            ],
        });
    }

    /**
     * Extract all unique categories from timeline data
     * @returns {string[]} The categories present across every year, in first-seen order.
     */
    #extractCategories() {
        const categoriesSet = new Set();
        const timelineEntries = Array.isArray(this.timelineData) ? this.timelineData : [];
        timelineEntries.forEach((entry) => {
            Object.keys(entry.categories).forEach((cat) => categoriesSet.add(cat));
        });
        const categories = Array.from(categoriesSet);

        // If categoryOrder is provided, sort according to it
        if (this.categoryOrder && Array.isArray(this.categoryOrder)) {
            return categories.sort((a, b) => {
                const indexA = this.categoryOrder.indexOf(a);
                const indexB = this.categoryOrder.indexOf(b);
                // If both are in the order array, use their positions
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                // If only one is in the order array, it comes first
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                // If neither is in the order array, maintain original order
                return 0;
            });
        }

        return categories;
    }

    /**
     * Get color for a category
     * @param {string} category - The series to colour.
     * @returns {string} Its configured colour, or one derived by the fallback function.
     */
    #getColorForCategory(category) {
        if (this.categoryColors[category]) {
            return this.categoryColors[category];
        }
        return getCompetencyColor(category);
    }

    /**
     * Get label for a category
     * @param {string} category - The series to label.
     * @returns {string} Its configured label, or the category itself with the configured prefix.
     */
    #getCategoryLabel(category) {
        if (this.categoryLabels[category]) {
            return this.categoryLabels[category];
        }
        // Use categoryPrefix if provided, otherwise just return the category
        return this.categoryPrefix ? `${this.categoryPrefix} ${category}` : category;
    }

    /**
     * Get years array (cached in chartState)
     * @returns {Array} The years the timeline spans, empty once the chart is destroyed.
     */
    #getYears() {
        // Defensive guard: bail out if chart was destroyed
        if (this.destroyed) {
            console.warn('[ParallelCoordinatesChart] Chart was destroyed before getYears');
            return [];
        }
        if (!this.chartState.cache.years) {
            this.chartState.cache.years = this.timelineData.map((d) => d.year);
        }
        return this.chartState.cache.years;
    }

    /**
     * Calculate max value from timeline data (cached in chartState)
     * @returns {number} The largest value any year reaches, which the y-scale is fitted to.
     */
    #calculateMaxValue() {
        // Defensive guard: bail out if chart was destroyed
        if (this.destroyed) {
            console.warn('[ParallelCoordinatesChart] Chart was destroyed before calculateMaxValue');
            return 100;
        }

        if (this.isStacked) {
            return 100;
        }
        if (this.yMax !== null) {
            return this.yMax;
        }

        if (!this.chartState.cache.maxValue) {
            let max = 0;
            for (const entry of this.timelineData) {
                for (const value of Object.values(entry.categories)) {
                    if (value > max) max = value;
                }
            }
            // Fall back to 100 when every value is 0 — a [0,0] domain collapses the
            // axis to a single tick and (being falsy) would also defeat this cache.
            const rounded =
                Math.ceil(max / ParallelCoordinatesChart.TICK_INTERVAL) *
                ParallelCoordinatesChart.TICK_INTERVAL;
            this.chartState.cache.maxValue = rounded || 100;
        }
        return this.chartState.cache.maxValue;
    }

    /**
     * Transform data for line/area rendering
     * @param {string} category - The series to extract.
     * @param {Array<object>} data - The timeline rows.
     * @returns {Array<object>} One point per year; stacked mode adds the baseline the band sits on.
     */
    #getLineData(category, data) {
        if (this.isStacked) {
            return data.map((d) => ({
                year: d.year,
                measured: d.measured === true,
                base: d.base[category] || 0,
                value: d.categories[category] || 0,
            }));
        } else {
            return data.map((d) => ({
                year: d.year,
                measured: d.measured === true,
                value: d.categories[category] || 0,
            }));
        }
    }

    /**
     * Sanitize category name for use as CSS class
     * Replaces invalid characters and ensures it doesn't start with a number
     * @param {string} category - The series name.
     * @returns {string} A class name safe to put in a selector.
     */
    #sanitizeCategoryForClass(category) {
        return 'cat-' + String(category).replace(/[^A-Za-z0-9_-]/g, '_');
    }

    /**
     * Transform data for stacked mode
     * @returns {Array<object>} The timeline rows with each year's per-category baselines added.
     */
    #prepareStackedData() {
        return this.timelineData.map((entry) => {
            let acc = 0;
            const base = {};
            this.categories.forEach((cat) => {
                base[cat] = acc;
                acc += entry.categories[cat] || 0;
            });
            return {
                year: entry.year,
                measured: entry.measured,
                base,
                categories: { ...entry.categories },
            };
        });
    }

    /**
     * Set view mode (stacked or normal) and update visualization without full re-render
     * @param {boolean} stacked - True for stacked view, false for normal view
     */
    setViewMode(stacked) {
        if (this.isStacked === stacked) {
            return; // No change needed
        }

        this.isStacked = stacked;
        this.chartState.cache.maxValue = null; // Clear cache for recalculation

        // Update scales
        const maxValue = this.#calculateMaxValue();
        this.yScale.domain([0, maxValue]);

        // Prepare new data
        const data = this.isStacked ? this.#prepareStackedData() : this.timelineData;

        // Update visualization
        this.#updateVisualization(data);

        // Update axes
        this.#updateAxes();

        // The legend sample follows the mark: a line for lines, a swatch for bands.
        this.#rebuildLegend();
    }

    /**
     * Update visualization with new data (efficient update without full re-render)
     * @param {Array<object>} data - The timeline rows to draw.
     */
    #updateVisualization(data) {
        // Batch remove wrong-mode paths so a stacked⇄unstacked toggle leaves no stale shapes.
        this.seriesLayer.selectAll(this.isStacked ? '.line' : '.area').remove();

        const generators = this.#createSeriesGenerators();
        this.categories.forEach((category) => {
            this.#renderCategory(category, this.#getLineData(category, data), generators, true);
        });
        this.#renderEndLabels(true);
    }

    /**
     * Build the line/area path generators bound to the current scales.
     * @returns {{ line: Function, area: Function }} The two generators; only the one matching the current stacking mode is used per render.
     */
    #createSeriesGenerators() {
        // Straight segments between cohorts: each year is an independent Jahrgang,
        // and a smoothed curve would show values no cohort ever had.
        const line = d3
            .line()
            .x(
                (d) =>
                    this.xScale(/** @type {LineDataPoint} */ (/** @type {unknown} */ (d)).year) ??
                    0,
            )
            .y((d) => this.yScale(/** @type {LineDataPoint} */ (/** @type {unknown} */ (d)).value))
            .curve(d3.curveLinear);

        const area = d3
            .area()
            .x(
                (d) =>
                    this.xScale(/** @type {LineDataPoint} */ (/** @type {unknown} */ (d)).year) ??
                    0,
            )
            .y0((d) =>
                this.yScale(/** @type {LineDataPoint} */ (/** @type {unknown} */ (d)).base ?? 0),
            )
            .y1((d) =>
                this.yScale(
                    (/** @type {LineDataPoint} */ (/** @type {unknown} */ (d)).base ?? 0) +
                        /** @type {LineDataPoint} */ (/** @type {unknown} */ (d)).value,
                ),
            )
            .curve(d3.curveLinear);

        return { line, area };
    }

    /**
     * Upsert the path and dots for one category. The path/dot geometry is set
     * immediately on the initial render and transitioned on updates (`animate`).
     * Dot tooltips and the resting radius are wired on enter only; `cx` is fixed
     * to the year scale and never updated.
     * @param {string} category - The series to draw.
     * @param {Array<object>} lineData - Its points, one per year.
     * @param {object} generators - The path generators bound to the current scales.
     * @param {Function} generators.line - Line generator, used in unstacked mode.
     * @param {Function} generators.area - Area generator, used in stacked mode.
     * @param {boolean} animate - Transition to the new geometry rather than setting it outright.
     */
    #renderCategory(category, lineData, { line, area }, animate) {
        const isStacked = this.isStacked;
        const categoryColor = this.#getColorForCategory(category);
        const safeCategoryClass = this.#sanitizeCategoryForClass(category);
        const settle = (sel) =>
            animate && !prefersReducedMotion()
                ? sel.transition().duration(ChartRenderer.TRANSITION_DURATION)
                : sel;

        // Line or area path (one per category)
        const pathClass = isStacked ? 'area' : 'line';
        let path = this.seriesLayer.select(`.${pathClass}.${safeCategoryClass}`);
        if (path.empty()) {
            path = this.seriesLayer
                .append('path')
                .attr('class', `${pathClass} ${safeCategoryClass}`)
                .attr('fill', isStacked ? categoryColor : 'none')
                .attr('stroke', categoryColor)
                .attr('stroke-width', isStacked ? 1 : ParallelCoordinatesChart.LINE_STROKE_WIDTH)
                .style('pointer-events', 'none');
        }
        settle(path.datum(lineData).style('pointer-events', 'none'))
            .attr('d', isStacked ? area : line)
            .style(
                'opacity',
                isStacked
                    ? ParallelCoordinatesChart.AREA_OPACITY
                    : ParallelCoordinatesChart.LINE_OPACITY,
            );

        // Markers: a plain dot per year; the series is identified by its colour and
        // its end label.
        const dotPath = (radius) => d3.symbol(d3.symbolCircle, Math.PI * radius * radius)() ?? '';
        const markerPath = dotPath(this.dotRadius);
        const hoverPath = dotPath(this.dotRadiusHover);
        const placeMarker = (d) => `translate(${this.xScale(d.year) ?? 0}, ${this.#dotY(d)})`;
        this.dotLayer
            .selectAll(`.dot.${safeCategoryClass}`)
            .data(lineData)
            .join(
                (enter) => {
                    const dots = enter
                        .append('path')
                        .attr('class', `dot ${safeCategoryClass}`)
                        .attr('d', markerPath)
                        .attr('transform', placeMarker)
                        .attr('fill', categoryColor)
                        .style('opacity', 1);

                    this.wireTooltipEvents(dots, {
                        getTooltipContent: (d) => this.formatTooltipContent(d, { category }),
                        tooltipId: 'parallel-coordinates',
                        hoverEffect: {
                            enter: { d: hoverPath },
                            leave: { d: markerPath },
                            useTransition: true,
                            duration: 200,
                        },
                    });
                    return dots;
                },
                (update) => settle(update).attr('transform', placeMarker),
            );
    }

    /**
     * The y a marker sits at in the current mode: the value itself, or the top of the
     * stacked band.
     * @param {LineDataPoint} d - The point.
     * @returns {number} Pixel y.
     */
    #dotY(d) {
        return this.yScale((this.isStacked ? d.base || 0 : 0) + (d.value || 0));
    }

    /**
     * Where each series' direct label belongs: just right of the last year, at the
     * line's value or the stacked band's middle.
     * @returns {Array<{category: string, label: string, x: number, y: number}>} One target per category.
     */
    #endLabelTargets() {
        const rows = this.isStacked ? this.#prepareStackedData() : this.timelineData;
        const last = rows[rows.length - 1];
        if (!last) return [];
        const x =
            (this.xScale(last.year) ?? 0) +
            this.dotRadiusHover +
            ParallelCoordinatesChart.END_LABEL_GAP;
        return this.categories.map((category) => {
            const value = last.categories[category] || 0;
            const base = this.isStacked ? last.base?.[category] || 0 : 0;
            return {
                category,
                label: this.#getCategoryLabel(category),
                x,
                y: this.isStacked ? this.yScale(base + value / 2) : this.yScale(value),
            };
        });
    }

    /**
     * Draw or move the direct labels, spread apart where series end close together.
     * @param {boolean} animate - Transition to the new positions rather than setting them.
     */
    #renderEndLabels(animate) {
        const fontSize = this.resolveChartTextSize(ParallelCoordinatesChart.END_LABEL_TEXT_SIZE);
        const targets = spreadLabelPositions(this.#endLabelTargets(), {
            minGap: fontSize * 1.15,
            min: 0,
            max: this.chartHeight,
        });
        const settle = (sel) =>
            animate && !prefersReducedMotion()
                ? sel.transition().duration(ChartRenderer.TRANSITION_DURATION)
                : sel;

        this.labelLayer
            .selectAll('.series-end-label')
            .data(targets, (d) => d.category)
            .join(
                (enter) => {
                    const labels = enter
                        .append('text')
                        .attr(
                            'class',
                            (d) => `series-end-label ${this.#sanitizeCategoryForClass(d.category)}`,
                        )
                        .attr('text-anchor', 'start')
                        .attr('dominant-baseline', 'middle')
                        .attr('x', (d) => d.x)
                        .attr('y', (d) => d.y)
                        .style('fill', getThemeColors().chrome.text)
                        .style('pointer-events', 'none')
                        .text((d) => d.label);
                    this.applyChartTextSize(labels, ParallelCoordinatesChart.END_LABEL_TEXT_SIZE);
                    return labels;
                },
                (update) => {
                    update.text((d) => d.label);
                    return settle(update)
                        .attr('x', (d) => d.x)
                        .attr('y', (d) => d.y);
                },
            );
    }

    /**
     * Update legend text labels to reflect current categoryLabels.
     * Called after updateData() to keep legend in sync when labels change
     * (e.g. switching between subjects with different naming conventions).
     */
    #updateLegendLabels() {
        if (!this.svg) return;
        for (const category of this.categories) {
            const label = this.#getCategoryLabel(category);
            const safeCategoryClass = this.#sanitizeCategoryForClass(category);
            this.svg.select(`.legend-item.${safeCategoryClass} text`).text(label);
        }
    }

    /**
     * Update axes with new scale
     */
    #updateAxes() {
        const maxValue = this.isStacked ? 100 : this.yScale.domain()[1];

        // Update Y-axis with transition
        const yAxis = this.chartGroup.select('.y-axis');
        yAxis
            .transition()
            .duration(motionDuration(ChartRenderer.TRANSITION_DURATION))
            .call(
                createPercentAxis('left', this.yScale, {
                    tickValues: d3.range(0, maxValue + 1, ParallelCoordinatesChart.TICK_INTERVAL),
                }),
            );
        this.normalizeSvgTypography(yAxis);

        // Apply consistent styling to all text elements (including new ones)
        yAxis.selectAll('text').style('fill', 'var(--heading-color)');
    }

    /**
     * Create the chart content (implements ChartRenderer.renderChart)
     */
    renderChart() {
        const preCalcDims = this.dimensions || this.calculateDimensions();
        const legendFontSize = this.resolveChartTextSize(ParallelCoordinatesChart.LEGEND_TEXT_SIZE);

        // Prepare legend items for measurement
        const legendItems = this.#buildLegendItems(legendFontSize);

        // Measure axes
        const years = this.#getYears();
        const maxValue = this.#calculateMaxValue();
        const yTicks = d3.range(0, maxValue + 1, ParallelCoordinatesChart.TICK_INTERVAL);
        const yTickLabels = yTicks.map(formatPercentTick);

        const bottomAxis = measureCategoryAxisSpace(this, 'bottom', years);
        const leftAxis = measurePercentAxisSpace(this, 'left', {
            tickValues: yTicks,
            axisTitleText: this.yAxisLabel,
        });
        const yTickReserve = measureEdgeTickReserve(this, yTickLabels, {
            useHeight: true,
            fontFamily: this.getChartFont(),
        });
        const topAxis = Math.ceil(
            Math.max(
                yTickReserve,
                preCalcDims.elements.circleRadiusHover + AXIS_DEFAULTS.edgeTickBuffer,
            ),
        );
        const lastYearReserve = measureEdgeTickReserve(
            this,
            [String(years[years.length - 1] ?? '')],
            {
                fontFamily: this.getChartFont(),
            },
        );
        // The direct series labels sit right of the last year; reserve their width.
        const endLabelReserve =
            preCalcDims.elements.circleRadiusHover +
            ParallelCoordinatesChart.END_LABEL_GAP +
            this.measureTexts(
                this.categories.map((category) => this.#getCategoryLabel(category)),
                {
                    fontSize: this.resolveChartTextSize(
                        ParallelCoordinatesChart.END_LABEL_TEXT_SIZE,
                    ),
                    fontFamily: this.getChartFont(),
                },
            ).maxWidth;
        const rightAxis = Math.ceil(
            Math.max(
                lastYearReserve,
                preCalcDims.elements.circleRadiusHover + AXIS_DEFAULTS.edgeTickBuffer,
                endLabelReserve,
            ),
        );

        const estimatedLegendSlotWidth = this.legend.getAvailableLegendSlotWidth({
            left: leftAxis,
            right: rightAxis,
            buffer: ParallelCoordinatesChart.LEGEND_SLOT_BUFFER,
            containerWidth: preCalcDims.containerWidth,
        });
        const legendConfig = this.#buildLegendConfig(
            legendItems,
            estimatedLegendSlotWidth,
            legendFontSize,
        );

        // Initialize SVG with layout
        const {
            svg,
            g: chartGroup,
            dimensions,
            layout,
        } = this.initializeSVG({
            axisOverrides: { top: topAxis, bottom: bottomAxis, left: leftAxis, right: rightAxis },
            legendConfigs: [legendConfig],
        });

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        // Store dimensions for update paths
        this.containerWidth = dimensions.containerWidth;
        this.containerHeight = dimensions.containerHeight;
        this.chartWidth = chartWidth;
        this.chartHeight = chartHeight;
        this.svg = svg;
        this.chartGroup = chartGroup;
        // Keep filled/line geometry behind circles so dot hover remains reachable.
        this.seriesLayer = chartGroup.append('g').attr('class', 'parallel-series-layer');
        this.dotLayer = chartGroup.append('g').attr('class', 'parallel-dot-layer');
        this.labelLayer = chartGroup.append('g').attr('class', 'parallel-label-layer');

        // Create scales
        const xScale = d3
            .scalePoint()
            .domain(years)
            .range([0, chartWidth])
            .padding(ParallelCoordinatesChart.SCALE_PADDING);

        const yScale = d3.scaleLinear().domain([0, maxValue]).range([chartHeight, 0]);

        this.xScale = xScale;
        this.yScale = yScale;

        // Prepare data
        const data = this.isStacked ? this.#prepareStackedData() : this.timelineData;

        // Responsive dot sizing (stored for use in updateData transitions)
        const dotRadius = Math.max(3, Math.min(6, dimensions.elements.circleRadius));
        const dotRadiusHover = Math.max(4, Math.min(8, dimensions.elements.circleRadiusHover));
        this.dotRadius = dotRadius;
        this.dotRadiusHover = dotRadiusHover;

        // Draw lines/areas
        this.#drawVisualization(data);

        // Add axes
        this.#addAxes(chartGroup, xScale, yScale, chartWidth, chartHeight);

        // The legend is stacked mode's only key (an end label there sits on a band
        // edge); in line mode the end labels already name every series, so the slot
        // stays reserved but empty. Kept so a stacking toggle can redraw it.
        this.legendState = { legendConfig, layout };
        if (this.isStacked) this.#addLegend(svg, legendConfig, layout);
    }

    /**
     * One legend entry per category, its sample drawn the way the mark is: a line in
     * line mode, a swatch in stacked mode.
     * @param {number} fontSize - Legend font size in px, for the text measurement.
     * @returns {Array<object>} The legend items.
     */
    #buildLegendItems(fontSize) {
        const symbolSize = this.isStacked ? 12 : 7;
        return this.categories.map((category) => {
            return {
                label: this.#getCategoryLabel(category),
                color: this.#getColorForCategory(category),
                symbol: this.isStacked ? 'rect' : 'line',
                symbolSize,
                textWidth: this.measureTexts([this.#getCategoryLabel(category)], {
                    fontSize,
                    fontFamily: this.getChartFont(),
                }).maxWidth,
                className: this.#sanitizeCategoryForClass(category),
                stroke: getThemeColors().chrome.text,
            };
        });
    }

    /** Redraw the legend with the current mode's symbols in the measured slot. */
    #rebuildLegend() {
        if (!this.svg || !this.legendState) return;
        const { legendConfig, layout } = this.legendState;
        const fontSize = this.resolveChartTextSize(ParallelCoordinatesChart.LEGEND_TEXT_SIZE);
        this.svg.selectAll('g.legend').remove();
        if (!this.isStacked) return;
        this.#addLegend(
            this.svg,
            { ...legendConfig, items: this.#buildLegendItems(fontSize) },
            layout,
        );
    }

    #buildLegendConfig(legendItems, availableWidth, fontSize) {
        return {
            items: legendItems,
            fontSize,
            layout: this.legend.resolveAdaptiveLegendLayout(legendItems, availableWidth, {
                defaultSymbolSize: ParallelCoordinatesChart.DOT_RADIUS_HOVER,
                symbolTextGap: ParallelCoordinatesChart.LEGEND_SYMBOL_TEXT_GAP,
                columnGap: ParallelCoordinatesChart.LEGEND_COLUMN_GAP,
            }),
        };
    }

    /**
     * Draw visualization (lines/areas and dots) on the initial render.
     * @param {Array<object>} data - The timeline rows to draw.
     */
    #drawVisualization(data) {
        const generators = this.#createSeriesGenerators();
        this.categories.forEach((category) => {
            this.#renderCategory(category, this.#getLineData(category, data), generators, false);
        });
        this.#renderEndLabels(false);
    }

    /**
     * Add axes to chart
     * @param {d3.Selection} chartGroup - The plot group the axes are appended to.
     * @param {any} xScale - Year scale.
     * @param {any} yScale - Value scale.
     * @param {number} chartWidth - Plot width in px.
     * @param {number} chartHeight - Plot height in px, where the x-axis sits.
     */
    #addAxes(chartGroup, xScale, yScale, chartWidth, chartHeight) {
        // X-axis
        chartGroup
            .append('g')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .style('fill', 'var(--heading-color)');

        // Y-axis
        const maxValue = this.isStacked ? 100 : yScale.domain()[1];
        chartGroup
            .append('g')
            .attr('class', 'y-axis')
            .call(
                createPercentAxis('left', yScale, {
                    tickValues: d3.range(0, maxValue + 1, ParallelCoordinatesChart.TICK_INTERVAL),
                }),
            )
            .selectAll('text')
            .style('fill', 'var(--heading-color)');

        // Y-axis label
        this.renderAxisTitle(chartGroup, 'left', this.yAxisLabel, {
            fill: 'var(--heading-color)',
        });
    }

    /**
     * Add the bottom legend using the measured layout slot, centering fallback
     * multi-column variants when the horizontal row does not fit.
     * @param {d3.Selection} svg - The chart root the legend is drawn into.
     * @param {object} legendConfig - The legend's entries and measured layout candidates.
     * @param {object} layout - The measured chart layout, source of the legend's slot.
     */
    #addLegend(svg, legendConfig, layout) {
        const slot = layout?.legends?.[0];
        const resolvedLegendConfig = this.legend.resolveLegendLayoutForSlot(legendConfig, slot);

        const legend = this.legend.createLegend({
            svg,
            ...resolvedLegendConfig,
        });

        this.applyChartTextSize(
            legend.selectAll('text'),
            ParallelCoordinatesChart.LEGEND_TEXT_SIZE,
        );
    }

    /**
     * Update chart with new timeline data, animating lines and dots to their new positions.
     * Used by domain-change event handlers to transition between subjects without a full rebuild.
     *
     * Both axes must stay the same between calls: if the category set changes (e.g.
     * switching between subjects with different KS level sets) or the years do, returns
     * false so the caller can fall back to a full rerender — which rebuilds the legend
     * and both scales correctly.
     *
     * When categories are unchanged, surviving paths and dots transition to their new y-positions
     * via D3.
     * @param {Array<{year: string, measured: boolean, categories: object}>} newTimelineData - The rows to transition to.
     * @param {{[category: string]: string}} [newCategoryColors] - Replacement color map (optional)
     * @param {{[category: string]: string}|null} [newCategoryLabels] - Replacement label map (optional)
     * @returns {boolean} false when the chart is not rendered yet, or the years or categories changed
     */
    updateData(newTimelineData, newCategoryColors, newCategoryLabels) {
        if (this.destroyed || !this.chartGroup) return false;

        const oldCategories = this.categories;

        // Update instance state
        this.timelineData = newTimelineData;
        if (newCategoryColors) this.categoryColors = newCategoryColors;
        if (newCategoryLabels !== undefined) this.categoryLabels = newCategoryLabels || {};
        this.categories = this.#extractCategories();
        this.chartState.cache.maxValue = null;

        // The x-scale's domain is built once per full render, and this in-place path
        // never rebuilds it — so a changed year list is a miss, exactly like a changed
        // category set below. Two Bereiche can span different years (buildKsHistory
        // drops a year with no data) while keeping the same categories, which is
        // precisely the case that reaches here. Transitioning it would send every year
        // the old domain does not know to the `?? 0` fallback at the left edge, under
        // an axis still labelled with the years it replaced.
        const previousYears = this.chartState.cache.years;
        this.chartState.cache.years = null;
        const yearsChanged =
            !previousYears ||
            previousYears.join('|') !== newTimelineData.map((entry) => entry.year).join('|');
        if (yearsChanged) return false;

        // If the category set has changed the legend would become stale, so signal
        // the caller to fall back to a full rerender (which rebuilds legend + SVG).
        // This happens when switching between subjects with different KS level sets
        // (e.g. DE Ia/Ib/… vs MA A1/A2/…). Same-subject domain switches keep the
        // same categories and continue to animate in-place.
        const newCategorySet = new Set(this.categories);
        const categoriesChanged =
            oldCategories.length !== this.categories.length ||
            oldCategories.some((c) => !newCategorySet.has(c));
        if (categoriesChanged) return false;

        // Recalculate y-scale domain for the new data range
        const maxValue = this.#calculateMaxValue();
        this.yScale.domain([0, maxValue]);

        // Transition all paths and dots to their new y-positions
        const data = this.isStacked ? this.#prepareStackedData() : this.timelineData;
        this.#updateVisualization(data);
        this.#updateAxes();
        this.#updateLegendLabels();

        return true;
    }

    // Note: Tooltip cleanup is automatic via chartState.tooltipIds tracking
}
