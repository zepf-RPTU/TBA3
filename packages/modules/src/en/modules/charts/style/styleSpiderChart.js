/**
 * Style Spider Chart for English Student/Class View
 * Creates a responsive spider/radar chart showing performance across style categories in both domains
 * Uses ChartRenderer pattern for consistency with other EN charts
 */

import { getThemeColors } from '../../../../common/services/themeService.js';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { getChartDomainAbbreviation } from '../../../../common/charts/domainLabelFormatter.js';
import { chartLayoutPreset, mergeChartLayout } from '../../../../common/charts/chartAxisUtils.js';
import { HIDDEN_LEGEND_OPACITY, appendMarkerDot } from '../../../../common/charts/markerSymbols.js';
import { EN_TERMS } from '../../../enTerms.js';
import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';
import {
    comparisonLegendEntry,
    comparisonSeriesColor,
    comparisonSeriesPaint,
    comparisonSeriesLabel,
} from '../../../../common/charts/comparisonSeries.js';
import { buildStyleCategoryPerformance } from '../../../utils/enStyleAggregation.js';
import * as d3 from 'd3';
import { initialActiveModes } from '../../../../common/charts/comparisonState.js';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const CHART_CONFIG = {
    LEVELS: 4,
    LABEL_OFFSET: 25,
    LABEL_BOUNDS_PADDING: 4,
    LABEL_FIT_MAX_PASSES: 5,
    LEGEND_SPACING: 40,
    LABEL_MARGIN: 40,
    LEGEND_BOTTOM_PADDING: 10,
    CIRCLE_STROKE_WIDTH: 1,
    CIRCLE_STROKE_OPACITY: 0.5,
    POINT_RADIUS_RATIO: 0.015,
    MIN_POINT_RADIUS: 3,
    HIDDEN_OPACITY: HIDDEN_LEGEND_OPACITY,
    COLORS: {
        FILL_OPACITY: {
            COMPARISON: 0.1,
            CLASS: 0.1,
            STUDENT: 0.2,
        },
    },
};

/**
 * StyleSpiderChart - Spider/radar chart for style category performance
 * @augments ChartRenderer
 */
export class StyleSpiderChart extends ChartRenderer {
    /**
     * Shape of a single radar point produced by {@link StyleSpiderChart#preparePathData}.
     * The line generator only reads `x`/`y`; the rest carry tooltip metadata.
     * @typedef {{x: number, y: number, categoryLabel?: string, value?: number, seriesLabel?: string}} SpiderPoint
     */

    /**
     * @param {string} containerId - Container element ID (without #)
     * @param {Array} studentData - Student performance data
     * @param {string|null} studentId - Student ID (null for class average)
     * @param {string|null} displayName - Display name for student/class
     * @param {object} options - Additional options
     */
    constructor(containerId, studentData, studentId = null, displayName = null, options = {}) {
        options.enConfig.assertExactlyTwoDomains();
        super(containerId, {
            ...options,
            layout: mergeChartLayout(
                chartLayoutPreset('compactNoAxis', {
                    padding: { top: 4, right: 4, bottom: 4, left: 4 },
                }),
                options.layout,
            ),
        });

        this.studentData = studentData;
        this.studentId = studentId;
        this.displayName = displayName;
        this.enConfig = options.enConfig;
        this.classStyleAverages = options.classStyleAverages;
        // Drawn in payload order, one series each — the app renders every comparison
        // group it is given rather than choosing one. A group of a type this client
        // does not recognise draws as the catch-all series rather than being dropped:
        // silently absent here while visible in every other EN chart is worse than
        // present with a generic styling.
        this.comparisonGroups = this.classStyleAverages?.comparisonGroups ?? [];

        // Store which comparison modes are toggleable (others are always visible)
        this.comparisonModes = options.comparisonModes || this.enConfig.comparisonModeIds;

        // Initialize visibility state using base class method
        this.visibilityState = this.initVisibilityState(
            this.comparisonModes,
            initialActiveModes(options),
            { includeStudent: true, includeClass: true },
        );

        // Cached render inputs, grouped under chartState so they are released with the
        // instance (ChartRenderer.destroy() disconnects services; it nulls no properties).
        this.chartState.cache = {
            colors: null,
            categoryPerformance: null,
            classAverages: null,
            comparisonGroups: null,
            categories: null,
        };
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    /** @override */
    getInitialState() {
        const activeComparisons = initialActiveModes(this.options);
        return { activeModes: activeComparisons };
    }

    /**
     * @override
     * @returns {boolean} False when there are no students to draw, so ChartRenderer
     * shows its empty state instead of an axis frame with nothing on it.
     */
    validateData() {
        return !!(
            this.studentData &&
            Array.isArray(this.studentData) &&
            this.studentData.length > 0
        );
    }

    /**
     * Compute the axis angle for a category.
     * Domain0 occupies the left half-circle (top→left→bottom),
     * domain1 occupies the right half-circle (top→right→bottom).
     * First style starts at the top for each domain.
     * @param {{key: string, domain: string}} category - The axis descriptor; its key carries the style and its `domain` picks the half-circle.
     * @returns {number} Angle in degrees, clockwise from the top.
     */
    #calculateCategoryAngle(category) {
        const cats = this.enConfig.styleCategories;
        const n = cats.length;
        const spacing = 180 / n;
        const half = spacing / 2;
        const style = category.key.split('_')[1];
        const i = cats.findIndex((c) => c.value === style);

        if (category.domain === this.enConfig.domainLabels[0]) {
            // Left side: top-left → left → bottom-left
            return (360 - half - i * spacing) % 360;
        }
        // Right side: top-right → right → bottom-right
        return half + i * spacing;
    }

    /**
     * Convert angle to coordinates
     * @param {number} angle - Degrees clockwise from the top.
     * @param {number} radius - Distance from the centre in px.
     * @returns {{x: number, y: number}} Offset from the chart centre.
     */
    #angleToCoordinate(angle, radius) {
        const radians = ((angle - 90) * Math.PI) / 180;
        return {
            x: radius * Math.cos(radians),
            y: radius * Math.sin(radians),
        };
    }

    /**
     * Create category definitions
     * @returns {Array<{key: string, label: string, displayLabel: string, domain: string}>} One axis per domain × style, sorted by angle so the polygon traces clockwise.
     */
    #createCategoryDefinitions() {
        const cats = this.enConfig.styleCategories;
        const [d0, d1] = this.enConfig.domainIds;
        const label0 = this.enConfig.domainLabels[0];
        const label1 = this.enConfig.domainLabels[1];
        const domains = [
            { key: d0, term: label0, displayTerm: getChartDomainAbbreviation(label0) },
            { key: d1, term: label1, displayTerm: getChartDomainAbbreviation(label1) },
        ];

        const defs = domains.flatMap((domain) =>
            cats.map((cat) => ({
                key: `${domain.key}_${cat.value}`,
                label: `${domain.term}\n${cat.label}`,
                displayLabel: `${domain.displayTerm}\n${cat.label}`,
                domain: domain.term,
            })),
        );

        // Sort by computed angle so the polygon path traces clockwise
        return defs.sort(
            (a, b) => this.#calculateCategoryAngle(a) - this.#calculateCategoryAngle(b),
        );
    }

    /**
     * Build legend items in the same order and labels used for rendering.
     * @returns {Array<object>} One entry per drawn series: the student first when one is selected, then the class, then the comparison groups in payload order.
     */
    #buildLegendItems() {
        const items = [
            {
                label: this.classStyleAverages?.className,
                glossaryKey: GLOSSARY_KEYS.KLASSENSCHNITT,
                color: this.colors.chart.classAverage,
                class: 'class',
            },
            ...this.comparisonGroups.map((group) => ({
                ...comparisonLegendEntry(group, this.colors),
                class: group.id,
            })),
        ];

        if (this.studentId) {
            items.unshift(
                /** @type {any} */ ({
                    label: this.displayName || EN_TERMS.STUDENT,
                    color: this.colors.chart.studentPerformance,
                    class: 'student',
                }),
            );
        }

        return items;
    }

    renderChart() {
        // Calculate dimensions
        this.dimensions = this.calculateDimensions();

        const { containerWidth, containerHeight } = this.dimensions;

        // Cache colors in chartState for automatic cleanup. Force-refresh like the
        // other charts: only ksThemeService invalidates the 5s TTL cache, so a
        // light/dark switch re-rendering inside the TTL would otherwise serve
        // stale colors.
        this.chartState.cache.colors = getThemeColors(true);

        // Calculate data and store in chartState.cache
        this.chartState.cache.categoryPerformance = this.studentId
            ? buildStyleCategoryPerformance(this.studentData, this.studentId, this.enConfig)
            : null;

        // Class averages; the comparison series come from this.comparisonGroups
        this.chartState.cache.classAverages = this.classStyleAverages.classAverages;
        this.chartState.cache.categories = this.#createCategoryDefinitions();

        // Local aliases for cached values (for cleaner code below)
        this.colors = this.chartState.cache.colors;
        this.categoryPerformance = this.chartState.cache.categoryPerformance;
        this.classAverages = this.chartState.cache.classAverages;
        this.categories = this.chartState.cache.categories;

        // The legend sits below the web, always: a right-hand legend cost the web a
        // third of its radius on the wide student card, and the lollipop twin of this
        // card already keeps its legend at the bottom. The web takes the height that
        // the legend leaves.
        const horizontalLegend = this.#resolveLegendConfig();
        const legendReserve =
            horizontalLegend.size.height +
            CHART_CONFIG.LEGEND_SPACING +
            CHART_CONFIG.LEGEND_BOTTOM_PADDING;
        const bottomLegendFit = this.#fitChartSizeForLabelOverflow(
            containerHeight - legendReserve,
            containerWidth,
            { includeRight: true },
        );
        const chartSize = bottomLegendFit.chartSize;
        const labelOverflow = bottomLegendFit.labelOverflow;
        const legendY =
            chartSize / 2 +
            Math.max(0, chartSize / 2 - CHART_CONFIG.LABEL_MARGIN) +
            CHART_CONFIG.LEGEND_SPACING;
        const legendConfig = horizontalLegend.config;
        const chartBoundsWidth = labelOverflow.left + chartSize + labelOverflow.right;
        const totalWidth = Math.max(chartBoundsWidth, horizontalLegend.size.width);
        const chartBoundsOffsetX = Math.max(0, (totalWidth - chartBoundsWidth) / 2);
        const legendPosition = {
            x: Math.max(0, (totalWidth - horizontalLegend.size.width) / 2),
            y: legendY,
        };
        const totalHeight = Math.max(
            chartSize,
            legendY + horizontalLegend.size.height + CHART_CONFIG.LEGEND_BOTTOM_PADDING,
        );
        const chartCenterX = chartBoundsOffsetX + labelOverflow.left + chartSize / 2;

        const radius = Math.max(0, chartSize / 2 - CHART_CONFIG.LABEL_MARGIN);

        // Defensive guard: bail out if chart was destroyed during async operations
        if (this.destroyed) {
            console.warn('[StyleSpiderChart] Chart was destroyed before renderChart completed');
            return;
        }

        // Create SVG using base class method with viewBox for responsive scaling
        const svg = this.createSVGElement(totalWidth, totalHeight, { useViewBox: true });

        this.svg = svg;

        const g = svg.append('g').attr('transform', `translate(${chartCenterX}, ${chartSize / 2})`);

        const rScale = d3.scaleLinear().domain([0, 100]).range([0, radius]);

        // Draw background circles
        this.#drawBackgroundCircles(g, radius);

        // Draw axes and labels
        this.#drawAxesAndLabels(g, radius);

        // Prepare path data for all series
        const pathDataSets = this.#preparePathData(rScale);

        // Draw areas and points
        this.#drawAreas(g, pathDataSets);
        this.#drawDataPoints(g, pathDataSets, radius);

        this.#addLegend(svg, legendConfig, legendPosition);
    }

    /**
     * Format tooltip content for a spider chart data point.
     * @override
     * @param {object} d - Data point with categoryLabel, value, seriesLabel
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(d) {
        return this.buildTooltipHTML({
            title: d.categoryLabel,
            rows: [{ label: d.seriesLabel, value: `${d.value.toFixed(1)}%` }],
        });
    }

    /**
     * Draw background circles
     * @param {d3.Selection} g - The centred chart group the rings are drawn into.
     * @param {number} radius - Radius of the outermost ring, i.e. the 100% level.
     */
    #drawBackgroundCircles(g, radius) {
        for (let level = 1; level <= CHART_CONFIG.LEVELS; level++) {
            const levelRadius = (radius * level) / CHART_CONFIG.LEVELS;
            g.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', levelRadius)
                .attr('fill', 'none')
                .attr('stroke', this.colors.chrome.border)
                .attr('stroke-width', CHART_CONFIG.CIRCLE_STROKE_WIDTH)
                .attr('stroke-opacity', CHART_CONFIG.CIRCLE_STROKE_OPACITY);

            // The web's scale, read once: every other ring names its percent on the
            // vertical axis, which runs between two spokes and so stays clear of them.
            if (level % 2 === 0) {
                const ringLabel = g
                    .append('text')
                    .attr('class', 'ring-label')
                    .attr('x', 3)
                    .attr('y', -levelRadius - 3)
                    .attr('text-anchor', 'start')
                    .attr('fill', this.colors.chrome.textSecondary)
                    .text(`${Math.round((100 * level) / CHART_CONFIG.LEVELS)}\u00a0%`);
                this.applyChartTextSize(ringLabel, 'sm');
            }
        }
    }

    /**
     * Return appropriate text-anchor and dominant-baseline for a label
     * positioned at the given x coordinate (local chart g coordinates).
     * Labels push away from the chart center so the text doesn't bleed
     * back over the polygon area.
     * @param {number} labelX - x coordinate of the label anchor point
     * @returns {{ textAnchor: string, baseline: string }} SVG text alignment that pushes the label outward; labels near the vertical axis stay centred.
     */
    #getLabelAnchor(labelX) {
        const threshold = 5;
        if (labelX > threshold) return { textAnchor: 'start', baseline: 'middle' };
        if (labelX < -threshold) return { textAnchor: 'end', baseline: 'middle' };
        return { textAnchor: 'middle', baseline: 'middle' };
    }

    /**
     * Fit chart size to available width after measured label overflow is known.
     * @param {number} maxChartSize - Largest square side length allowed by height.
     * @param {number} availableWidth - Width available for chart square plus reserved labels.
     * @param {object} [options] - Tuning for what counts as reserved width.
     * @param {boolean} [options.includeRight=false] - Reserve right-side label overflow too.
     * @returns {{chartSize: number, labelOverflow: {left: number, right: number}, fitsWidth: boolean}} The settled square side, the overflow it implies, and whether the result actually fits the width offered.
     */
    #fitChartSizeForLabelOverflow(maxChartSize, availableWidth, options = {}) {
        const includeRight = options.includeRight === true;
        const safeMaxChartSize = Number.isFinite(maxChartSize) ? Math.max(0, maxChartSize) : 0;
        const safeAvailableWidth = Number.isFinite(availableWidth)
            ? Math.max(0, availableWidth)
            : 0;
        let chartSize = Math.min(safeMaxChartSize, safeAvailableWidth);
        let labelOverflow = { left: 0, right: 0 };

        for (let pass = 0; pass < CHART_CONFIG.LABEL_FIT_MAX_PASSES; pass += 1) {
            labelOverflow = this.#measureLabelOverflow(chartSize);
            const reservedLabelWidth =
                labelOverflow.left + (includeRight ? labelOverflow.right : 0);
            const nextChartSize = Math.min(
                safeMaxChartSize,
                Math.max(0, safeAvailableWidth - reservedLabelWidth),
            );

            if (Math.abs(nextChartSize - chartSize) < 0.5) {
                chartSize = nextChartSize;
                break;
            }

            chartSize = nextChartSize;
        }

        labelOverflow = this.#measureLabelOverflow(chartSize);
        const requiredWidth =
            chartSize + labelOverflow.left + (includeRight ? labelOverflow.right : 0);

        return {
            chartSize,
            labelOverflow,
            fitsWidth: requiredWidth <= safeAvailableWidth + 1,
        };
    }

    /**
     * Measure how far category labels extend beyond the chart square.
     * @param {number} chartSize - Square chart side length before label overflow.
     * @returns {{left: number, right: number}} Overflow in px past each side of the square.
     */
    #measureLabelOverflow(chartSize) {
        if (!Number.isFinite(chartSize) || chartSize <= 0 || !Array.isArray(this.categories)) {
            return { left: 0, right: 0 };
        }

        const radius = Math.max(0, chartSize / 2 - CHART_CONFIG.LABEL_MARGIN);
        const labelRadius = radius + CHART_CONFIG.LABEL_OFFSET;
        let minX = Infinity;
        let maxX = -Infinity;

        this.categories.forEach((category) => {
            const angle = this.#calculateCategoryAngle(category);
            const labelCoordinate = this.#angleToCoordinate(angle, labelRadius);
            const { textAnchor } = this.#getLabelAnchor(labelCoordinate.x);
            const line = (category.displayLabel || category.label).replace('\n', ' ');
            const measured = this.measureTexts([line], { fontWeight: 600 });
            const labelWidth = measured.maxWidth;

            let labelMinX = labelCoordinate.x;
            let labelMaxX = labelCoordinate.x;
            if (textAnchor === 'end') {
                labelMinX -= labelWidth;
            } else if (textAnchor === 'start') {
                labelMaxX += labelWidth;
            } else {
                labelMinX -= labelWidth / 2;
                labelMaxX += labelWidth / 2;
            }

            minX = Math.min(minX, labelMinX);
            maxX = Math.max(maxX, labelMaxX);
        });

        if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
            return { left: 0, right: 0 };
        }

        const halfChartSize = chartSize / 2;
        return {
            left: this.#withLabelBoundsPadding(Math.max(0, -halfChartSize - minX)),
            right: this.#withLabelBoundsPadding(Math.max(0, maxX - halfChartSize)),
        };
    }

    /**
     * Add a small anti-aliasing buffer only when labels exceed the chart square.
     * @param {number} overflow - Measured overflow in px; zero or less means the labels stay inside.
     * @returns {number} The padded overflow, or `0` when there is nothing to reserve.
     */
    #withLabelBoundsPadding(overflow) {
        return overflow > 0 ? Math.ceil(overflow + CHART_CONFIG.LABEL_BOUNDS_PADDING) : 0;
    }

    /**
     * Draw axes and labels
     * @param {d3.Selection} g - The centred chart group the spokes and labels are drawn into.
     * @param {number} radius - Radius of the outer ring, where the spokes end.
     */
    #drawAxesAndLabels(g, radius) {
        this.categories.forEach((category) => {
            const angle = this.#calculateCategoryAngle(category);
            const lineCoordinate = this.#angleToCoordinate(angle, radius);

            // Draw axis line
            g.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', lineCoordinate.x)
                .attr('y2', lineCoordinate.y)
                .attr('stroke', this.colors.chrome.border)
                .attr('stroke-width', 1);

            // Add labels
            const labelCoordinate = this.#angleToCoordinate(
                angle,
                radius + CHART_CONFIG.LABEL_OFFSET,
            );
            const { textAnchor, baseline } = this.#getLabelAnchor(labelCoordinate.x);
            const text = g
                .append('text')
                .attr('x', labelCoordinate.x)
                .attr('y', labelCoordinate.y)
                .style('font-weight', 'var(--fw-semibold)')
                .attr('text-anchor', textAnchor)
                .attr('dominant-baseline', baseline);

            // One line: the domain prefix carries the domain colour, the style name
            // reads in secondary ink — the label names the spoke, the polygons are the
            // data.
            const [prefix, ...rest] = (category.displayLabel || category.label).split('\n');
            const isDomain0 = category.domain === this.enConfig.domainLabels[0];
            const domainGlossaryKey = isDomain0
                ? GLOSSARY_KEYS.HOERVERSTEHEN
                : GLOSSARY_KEYS.LESEVERSTEHEN;
            const prefixRoot = text
                .append('tspan')
                .attr('fill', isDomain0 ? this.colors.chart.domain0 : this.colors.chart.domain1);
            this.renderGlossaryTextSegments(prefixRoot, prefix, {
                segments: [{ text: prefix, glossaryKey: domainGlossaryKey }],
                force: true,
            });
            const styleName = rest.join(' ');
            if (styleName) {
                const styleRoot = text
                    .append('tspan')
                    .attr('dx', '0.3em')
                    .attr('fill', this.colors.chrome.textSecondary);
                this.renderGlossaryTextSegments(styleRoot, styleName, {
                    segments: this.getGlossaryTextSegments(styleName),
                    force: true,
                });
            }
        });
    }

    /**
     * Prepare path data for all series.
     * @param {d3.ScaleLinear<number, number>} rScale - Maps a percentage onto a distance from the centre.
     * @returns {{class: SpiderPoint[], student?: SpiderPoint[], comparisons: Map<string, SpiderPoint[]>}} One closed point ring per drawn series, keyed by series.
     */
    #preparePathData(rScale) {
        const studentLabel = this.displayName || EN_TERMS.STUDENT;
        /** @type {{class: SpiderPoint[], student?: SpiderPoint[], comparisons: Map<string, SpiderPoint[]>}} */
        const pathDataSets = { class: [], comparisons: new Map() };
        for (const group of this.comparisonGroups) {
            pathDataSets.comparisons.set(group.id, []);
        }

        if (this.studentId && this.categoryPerformance) {
            pathDataSets.student = [];
        }

        this.categories.forEach((category) => {
            const angle = this.#calculateCategoryAngle(category);
            const categoryLabel = category.label.replace('\n', ' \u2014 ');

            // A spoke the series has no value on gets no vertex: the ring runs from
            // its neighbour to its neighbour instead of dipping to a 0 % it never had.
            const pushPoint = (points, rawValue, seriesLabel) => {
                if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return;
                const { x, y } = this.#angleToCoordinate(angle, rScale(rawValue));
                points?.push({ x, y, categoryLabel, value: rawValue, seriesLabel });
            };

            if (this.studentId && this.categoryPerformance) {
                pushPoint(
                    pathDataSets.student,
                    this.categoryPerformance[category.key],
                    studentLabel,
                );
            }
            pushPoint(
                pathDataSets.class,
                this.classAverages[category.key],
                this.classStyleAverages?.className,
            );
            for (const group of this.comparisonGroups) {
                pushPoint(
                    pathDataSets.comparisons.get(group.id),
                    group.averages[category.key],
                    comparisonSeriesLabel(group),
                );
            }
        });

        // Close the paths; a series without any value stays empty and draws nothing.
        const close = (points) => {
            if (points && points.length > 0) points.push(points[0]);
        };
        close(pathDataSets.class);
        close(pathDataSets.student);
        for (const points of pathDataSets.comparisons.values()) close(points);

        return pathDataSets;
    }

    /**
     * Get base series configuration for areas and points
     * @param {{class: SpiderPoint[], student?: SpiderPoint[], comparisons: Map<string, SpiderPoint[]>}} pathDataSets - The prepared point rings the configs point at.
     * @returns {Array<{type: string, data: SpiderPoint[], color: any, fillOpacity: number, visibility: any}>} Draw order: comparison groups first, then the class, then the student on top.
     */
    #getSeriesConfigs(pathDataSets) {
        /** @type {Array<{type: string, data: SpiderPoint[], color: any, fillOpacity: number, visibility: any}>} */
        const configs = this.comparisonGroups.map((group) => ({
            type: group.id,
            data: pathDataSets.comparisons.get(group.id),
            color: comparisonSeriesColor(group, this.colors),
            fillOpacity: CHART_CONFIG.COLORS.FILL_OPACITY.COMPARISON,
            visibility: this.visibilityState[group.id],
        }));

        configs.push({
            type: 'class',
            data: pathDataSets.class,
            color: this.colors.chart.classAverage,
            fillOpacity: CHART_CONFIG.COLORS.FILL_OPACITY.CLASS,
            visibility: this.visibilityState.class,
        });

        if (this.studentId && pathDataSets.student) {
            configs.push({
                type: 'student',
                data: pathDataSets.student,
                color: this.colors.chart.studentPerformance,
                fillOpacity: CHART_CONFIG.COLORS.FILL_OPACITY.STUDENT,
                visibility: this.visibilityState.student,
            });
        }

        return configs;
    }

    /**
     * Draw areas for all series
     * @param {d3.Selection} g - The centred chart group the polygons are drawn into.
     * @param {{class: SpiderPoint[], student?: SpiderPoint[], comparisons: Map<string, SpiderPoint[]>}} pathDataSets - The prepared point rings, one per series.
     */
    #drawAreas(g, pathDataSets) {
        // `any`, not `d3.Line<SpiderPoint>`: d3's generator is typed for `[x, y]` tuples
        // and the point type can only be supplied as a TS type argument, which JSDoc
        // cannot pass to `d3.line()`. The `.x`/`.y` casts below are where the real
        // datum shape is asserted.
        /** @type {any} */
        const line = d3
            .line()
            .x((d) => /** @type {SpiderPoint} */ (/** @type {unknown} */ (d)).x)
            .y((d) => /** @type {SpiderPoint} */ (/** @type {unknown} */ (d)).y)
            .curve(d3.curveLinearClosed);

        const areaConfigs = this.#getSeriesConfigs(pathDataSets);

        areaConfigs.forEach((config) => {
            g.append('path')
                .datum(config.data)
                .attr('d', line)
                .attr('class', `${config.type}-area`)
                .attr('fill', config.color)
                .attr('fill-opacity', config.fillOpacity)
                .attr('stroke', config.color)
                .attr('stroke-width', 2)
                .attr('opacity', config.visibility ? 1 : 0);
        });
    }

    /**
     * Draw data points
     * @param {d3.Selection} g - The centred chart group the markers are drawn into.
     * @param {{class: SpiderPoint[], student?: SpiderPoint[], comparisons: Map<string, SpiderPoint[]>}} pathDataSets - The prepared point rings, one per series.
     * @param {number} radius - Outer-ring radius, which the marker size scales with.
     */
    #drawDataPoints(g, pathDataSets, radius) {
        const pointRadius = Math.max(
            CHART_CONFIG.MIN_POINT_RADIUS,
            radius * CHART_CONFIG.POINT_RADIUS_RATIO,
        );

        // Comparison points take the fill mode their marks have on every other EN chart.
        const chartStroke = getThemeColors().chrome.chartStroke;
        const pointConfigs = this.comparisonGroups.map((group) => {
            const paint = comparisonSeriesPaint(group, this.colors);
            return {
                data: pathDataSets.comparisons.get(group.id),
                class: `${group.id}-point`,
                fill: paint.fill,
                stroke: paint.hollow ? paint.stroke : chartStroke,
                strokeWidth: 2,
                dotFill: paint.dotFill,
                visibility: this.visibilityState[group.id],
            };
        });

        pointConfigs.push({
            data: pathDataSets.class,
            class: 'class-point',
            fill: this.colors.chart.classAverage,
            stroke: chartStroke,
            strokeWidth: 2,
            visibility: this.visibilityState.class,
        });

        if (this.studentId && pathDataSets.student) {
            pointConfigs.push({
                data: pathDataSets.student,
                class: 'student-point',
                fill: this.colors.chart.studentPerformance,
                stroke: chartStroke,
                strokeWidth: 2,
                visibility: this.visibilityState.student,
            });
        }

        pointConfigs.forEach((config) => {
            const points = g
                .selectAll(`.${CSS.escape(config.class)}`)
                .data(config.data.slice(0, -1)) // Exclude the closing point
                .enter()
                .append('circle')
                .attr('class', config.class)
                .attr('cx', (d) => d.x)
                .attr('cy', (d) => d.y)
                .attr('r', pointRadius)
                .attr('fill', config.fill)
                .attr('stroke', config.stroke)
                .attr('stroke-width', config.strokeWidth)
                .attr('opacity', config.visibility ? 1 : 0);

            if (config.dotFill) {
                config.data.slice(0, -1).forEach((d) => {
                    appendMarkerDot(g, {
                        cx: d.x,
                        cy: d.y,
                        size: pointRadius,
                        fill: config.dotFill,
                        className: `${config.class}-dot`,
                    }).attr('opacity', config.visibility ? 1 : 0);
                });
            }

            this.wireTooltipEvents(points, {
                getTooltipContent: (d) => this.formatTooltipContent(d),
                isVisible: () => config.visibility,
                tooltipId: 'style-spider',
                hoverEffect: {
                    enter: { r: pointRadius * 1.6 },
                    leave: { r: pointRadius },
                    useTransition: true,
                },
            });
        });
    }

    #resolveLegendConfig() {
        const items = this.#buildLegendItems();
        return this.legend.resolveMeasuredLegendLayout(
            {
                items: items.map((item) => {
                    // Legend keys are the series keys: 'class', or a comparison group's id.
                    const opacity = this.visibilityState[item.class]
                        ? 1
                        : CHART_CONFIG.HIDDEN_OPACITY;
                    return {
                        label: item.label,
                        labelSegments: item.labelSegments ?? null,
                        glossaryKey: item.glossaryKey,
                        color: item.color,
                        symbol: 'line',
                        className: `${item.class}-legend`,
                        opacity,
                    };
                }),
            },
            [
                {
                    layout: {
                        direction: 'horizontal',
                        spacing: 140,
                    },
                },
            ],
        );
    }

    /**
     * Add legend
     * @param {object} svg - D3 SVG selection
     * @param {object} legendConfig - Measured legend config
     * @param {{x: number, y: number}} position - Legend anchor position
     */
    #addLegend(svg, legendConfig, position) {
        this.legend.createLegend({
            svg,
            ...legendConfig,
            layout: {
                ...legendConfig.layout,
                position,
            },
        });
    }

    /**
     * Get visibility config for spider chart elements
     * @override
     * @protected
     * @returns {object} Config for applyVisibilityTransitions()
     */
    _getVisibilityConfig() {
        const elements = { class: this.svg.selectAll('.class-area, .class-point') };
        const legends = { class: this.svg.select('.class-legend') };
        for (const group of this.comparisonGroups) {
            const key = CSS.escape(group.id);
            elements[group.id] = this.svg.selectAll(
                `.${key}-area, .${key}-point, .${key}-point-dot`,
            );
            legends[group.id] = this.svg.select(`.${key}-legend`);
        }

        return {
            elements,
            legends,
            visibilityState: this.visibilityState,
            hiddenOpacity: CHART_CONFIG.HIDDEN_OPACITY,
        };
    }

    // Cached values in chartState.cache are auto-cleaned by destroy()
}
