/**
 * Style Lollipop Chart for English class and student views
 * Horizontal lollipop chart showing style-category performance
 * Supports single-domain and grouped (both domains) modes
 * Uses D3 join-based incremental updates via setState for flicker-free data refreshes
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { LollipopChartRenderer } from '../../../../common/charts/renderers/lollipopChartRenderer.js';
import { getChartDomainAbbreviation } from '../../../../common/charts/domainLabelFormatter.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    measureCategoryAxisSpace,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { HIDDEN_LEGEND_OPACITY } from '../../../../common/charts/markerSymbols.js';
import { EN_TERMS } from '../../../enTerms.js';
import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';
import {
    comparisonLegendEntry,
    comparisonMarkerLegendPaint,
    comparisonSeriesPaint,
    comparisonSeriesLabel,
    comparisonSeriesVisual,
} from '../../../../common/charts/comparisonSeries.js';
import { buildStyleCategoryPerformance } from '../../../utils/enStyleAggregation.js';
import * as d3 from 'd3';
import { initialActiveModes } from '../../../../common/charts/comparisonState.js';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const CHART_CONFIG = {
    CIRCLE: {
        RADIUS: 8,
        STROKE_WIDTH: 2,
    },
    HEAD: {
        MIN_WIDTH: 38,
        MIN_HEIGHT: 18,
        PADDING_X: 7,
        PADDING_Y: 2,
        HOVER_GROWTH: 2,
        RIGHT_GAP: 8,
        MIN_PAIR_CLEARANCE: 2,
    },
    GROUPED_BANDS: {
        PADDING_CANDIDATES: [
            { outerInner: 0.12, outerOuter: 0.04, inner: 0.08 },
            { outerInner: 0.08, outerOuter: 0.03, inner: 0.06 },
            { outerInner: 0.03, outerOuter: 0.015, inner: 0.03 },
            { outerInner: 0.01, outerOuter: 0.01, inner: 0.02 },
        ],
    },
    SINGLE_BAND: {
        PADDING: 0.3,
    },
    LAYOUT: {
        TOP_PADDING: 4,
        LEGEND_GAP: 4,
        BOTTOM_AXIS_TICK_PADDING: 4,
    },
    /** Grouped mode: where the domain letter sits, just inside the stem base. */
    DOMAIN_TAG: {
        X: 3,
    },
    VALUE_LABEL: {
        TEXT_SIZE: 'sm',
    },
    /**
     * The selected person's mark: a hollow pill on the value, the same geometry as
     * the class's filled pill and in the row's own colour. Hollow against filled,
     * so the two are told apart by fill mode and not by a third hue. Only drawn in
     * single-domain mode: the student view's `all` is the spider.
     */
    STUDENT: {
        PILL_STROKE_WIDTH: 2,
        /** When the two pills would overlap, the student's rises off the stem by this gap. */
        LIFT_GAP: 2,
    },
    LINE: {
        STROKE_WIDTH: 3,
    },
    LEGEND: {
        ITEM_SPACING: 150,
        /** Gap between two legend entries when the row is not wrapped, px. */
        ITEM_GAP: 28,
        HIDDEN_OPACITY: HIDDEN_LEGEND_OPACITY,
    },
    AVERAGES: {
        OPACITY: 0.8,
    },
    COLORS: {
        get WHITE() {
            return getThemeColors().chrome.chartStroke;
        },
    },
};

/**
 * @param {unknown} value - A percentage as the averages hold it.
 * @returns {number|null} The number, or `null` when there is none to draw.
 */
function finiteOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * @param {number|null|undefined} value - A percentage, or nothing.
 * @returns {string} `12.3%`, or `N/A` for a value the payload did not carry.
 */
function formatPercent(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : 'N/A';
}

/**
 * StyleLollipopChart - Horizontal lollipop chart for category performance
 * @augments LollipopChartRenderer
 */
export class StyleLollipopChart extends LollipopChartRenderer {
    /** @type {d3.ScaleBand<string>} — set in both grouped and single-domain render paths before any read */
    yScale;
    /** @type {d3.ScaleBand<string>|undefined} — only set in grouped mode */
    yScaleInner;

    /**
     * @param {string} containerSelector - CSS selector for container
     * @param {Array} studentData - Student performance data
     * @param {string|null} studentId - Student ID (null for class average)
     * @param {string|null} domain - Domain filter ('domain0', 'domain1', or null)
     * @param {{[key: string]: any}} [options={}] - Additional options (comparisonModes, comparisonState, styleAverages, …)
     */
    constructor(containerSelector, studentData, studentId = null, domain = null, options = {}) {
        options.enConfig.assertExactlyTwoDomains();
        super(containerSelector, {
            ...options,
            layout: chartLayoutPreset('bottomLegend', {
                legends: [{ position: 'bottom', gap: CHART_CONFIG.LAYOUT.LEGEND_GAP }],
                padding: {
                    top: CHART_CONFIG.LAYOUT.TOP_PADDING,
                    right: 20,
                },
            }),
        });

        this.studentData = studentData;
        this.studentId = studentId;
        this.domain = domain;
        this.isStudentView = !!studentId;
        this.enConfig = options.enConfig;
        // Already resolved by StyleChartController: filtered values where the table
        // supplied them, over the class-level parse the class name comes from.
        this.styleAverages = options.styleAverages;
        this.comparisonGroups = this.#resolveComparisonGroups(this.styleAverages?.comparisonGroups);

        // Store which comparison modes are toggleable (others are always visible)
        // Note: Lollipops always show class data, so klassenschnitt is not toggleable here
        this.comparisonModes = options.comparisonModes || this.enConfig.comparisonModeIds;

        // Initialize visibility state using base class method
        // Lollipops don't have student/class toggles - they always show class data
        this.visibilityState = this.initVisibilityState(
            this.comparisonModes,
            initialActiveModes(options),
            { includeStudent: false, includeClass: false },
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
     * Handle reactive state changes with optimised incremental updates.
     * - activeModes only → base class visibility transitions (no re-render)
     * - styleData      → D3 join-based data update (no SVG rebuild)
     * - domain change   → full refresh (layout changes between grouped/single)
     * @override
     */
    _onStateChanged(changedKeys, _prevState) {
        if (!this.svg) {
            this.refresh();
            return;
        }

        // activeModes-only → base class handles visibility transitions
        if (changedKeys.includes('activeModes') && !changedKeys.includes('styleData')) {
            super._onStateChanged(changedKeys, _prevState);
            return;
        }

        // Domain change means grouped↔single layout switch → must rebuild
        if (changedKeys.includes('domain')) {
            this.domain = this._state.domain;
            this.refresh();
            return;
        }

        if (changedKeys.includes('styleData')) {
            const handled = this.#handleDataUpdate(this._state.styleData);
            if (!handled) this.refresh();
            return;
        }

        this.refresh();
    }

    /**
     * The comparison groups to draw, in payload order. A chart renders every group it
     * is given — several state groups mean several series, and a group of a type this
     * client does not recognise draws with the catch-all mark rather than being
     * dropped, which would show the reader nothing and say nothing about why.
     * @param {Array<import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup>} [groups] - Groups as the payload delivered them, or nothing when none were.
     * @returns {Array<import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup>} The same list, or an empty one, so callers never branch on nullish.
     */
    #resolveComparisonGroups(groups) {
        return groups ?? [];
    }

    /**
     * Per-group value for one `${domain}_${style}` key, for a single chart row.
     * @param {string} avgKey - The `${domain}_${style}` key to read out of every group's averages.
     * @returns {{[groupId: string]: number|null}} That row's value per group, keyed by group id; `null` for a group missing the key, which draws no marker.
     */
    #comparisonValuesFor(avgKey) {
        /** @type {{[groupId: string]: number|null}} */
        const values = {};
        for (const group of this.comparisonGroups) {
            values[group.id] = finiteOrNull(group.averages[avgKey]);
        }
        return values;
    }

    /**
     * Tooltip rows for the delivered comparison groups, in payload order.
     * @param {{comparisons?: {[groupId: string]: number|null}}} row - The chart row whose per-group values are being described.
     * @returns {Array<{label: string, value: string}>} One tooltip line per group; the label carries the ordinal tag when the group has one, so the mark can be matched to the text.
     */
    #comparisonTooltipRows(row) {
        return this.comparisonGroups.map((group) => ({
            label: comparisonSeriesLabel(group),
            value: formatPercent(row.comparisons?.[group.id]),
        }));
    }

    /**
     * Incremental data update using D3 enter/update/exit joins.
     * Avoids full SVG teardown, preserving chart DOM/state across updates.
     * @param {object} styleData - { classAverages, comparisonGroups, categoryPerformance }
     * @returns {boolean} true if handled, false to fall back to full refresh
     */
    #handleDataUpdate(styleData) {
        if (!this.svg || !this.g || !this.chartState.renderState) return false;

        const rs = this.chartState.renderState;
        const isGrouped = this.#isGroupedMode();

        // Layout mismatch → must do full re-render
        if (isGrouped !== rs.isGrouped) return false;

        // Apply new averages
        this.classAverages = styleData.classAverages;
        this.comparisonGroups = this.#resolveComparisonGroups(styleData.comparisonGroups);
        this.categoryPerformance = styleData.categoryPerformance;

        // Also update the chartState cache
        this.chartState.cache.classAverages = styleData.classAverages;
        this.chartState.cache.comparisonGroups = this.comparisonGroups;
        this.chartState.cache.categoryPerformance = styleData.categoryPerformance;

        const duration = ChartRenderer.TRANSITION_DURATION;

        this.#updateElements(duration);

        // Rebuild legend (no animation — same as ItemLollipopChart pattern)
        this.#rebuildLegend();

        return true;
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
     * Minimum container height (px) below which the current mode's lollipop rows
     * can no longer maintain their own minimum readable size. Recomputed on every
     * render; null until the first render has run.
     * @returns {number|null} The floor in px, or `null` while it is still unknown.
     */
    getRequiredMinHeight() {
        return this.chartState.cache.requiredMinHeight ?? null;
    }

    /**
     * Format tooltip content for style lollipop data
     * @param {object} segment - Data for single domain or grouped domain
     * @param {object} context - Context with type: 'single' | 'grouped'
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        const { type = 'single' } = context;

        if (type === 'grouped') {
            const { styleLabel, domainData } = segment;
            const rows = [];

            if (this.studentId) {
                rows.push({
                    label: EN_TERMS.STUDENT,
                    value: formatPercent(domainData.studentValue),
                });
            }

            rows.push({
                label: this.styleAverages?.className,
                value: formatPercent(domainData.value),
            });
            rows.push(...this.#comparisonTooltipRows(domainData));

            return this.buildTooltipHTML({
                title: `${styleLabel} - ${domainData.domainLabel}`,
                rows,
            });
        }

        // Single domain mode
        const rows = [];

        if (this.studentId) {
            rows.push({ label: EN_TERMS.STUDENT, value: formatPercent(segment.studentValue) });
        }

        rows.push({ label: this.styleAverages?.className, value: formatPercent(segment.value) });
        rows.push(...this.#comparisonTooltipRows(segment));

        return this.buildTooltipHTML({
            title: segment.label,
            rows,
        });
    }

    /**
     * Calculate Y-position for category item (centered in band)
     * @param {string} label - The category the row belongs to, as used in the band scale's domain.
     * @returns {number} Pixel y of the row's centre line.
     */
    #getCategoryY(label) {
        return (this.yScale(label) ?? 0) + this.yScale.bandwidth() / 2;
    }

    #formatValueLabel(value) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? `${numericValue.toFixed(0)}%` : '0%';
    }

    #resolveLollipopHeadSize() {
        const measured = this.measureTexts(['100%'], {
            textSize: /** @type {'sm'|'base'|'lg'} */ (CHART_CONFIG.VALUE_LABEL.TEXT_SIZE),
            fontWeight: 'bold',
        });
        const width = Math.ceil(
            Math.max(
                CHART_CONFIG.HEAD.MIN_WIDTH,
                measured.maxWidth + CHART_CONFIG.HEAD.PADDING_X * 2,
            ),
        );
        const height = Math.ceil(
            Math.max(
                CHART_CONFIG.HEAD.MIN_HEIGHT,
                measured.maxHeight + CHART_CONFIG.HEAD.PADDING_Y * 2,
            ),
        );

        return {
            width,
            height,
            rx: height / 2,
            ry: height / 2,
            rightReserve: Math.ceil(
                width / 2 + CHART_CONFIG.HEAD.HOVER_GROWTH + CHART_CONFIG.HEAD.RIGHT_GAP,
            ),
        };
    }

    #getHeadHoverConfig(getX, getY, headSize) {
        const grow = CHART_CONFIG.HEAD.HOVER_GROWTH;
        const hoverWidth = headSize.width + grow * 2;
        const hoverHeight = headSize.height + grow * 2;

        return {
            enter: {
                x: (d) => getX(d) - grow,
                y: (d) => getY(d) - grow,
                width: hoverWidth,
                height: hoverHeight,
                rx: hoverHeight / 2,
                ry: hoverHeight / 2,
            },
            leave: {
                x: getX,
                y: getY,
                width: headSize.width,
                height: headSize.height,
                rx: headSize.rx,
                ry: headSize.ry,
            },
        };
    }

    /**
     * The value text inside a pill.
     * @param {d3.Selection} labels - The pill texts.
     * @param {string} fill - Text colour: surface ink on the filled class pill, chrome text on the hollow student pill.
     * @returns {d3.Selection} The same selection.
     */
    #styleValueLabels(labels, fill) {
        this.applyChartTextSize(
            labels,
            /** @type {'sm'|'base'|'lg'} */ (CHART_CONFIG.VALUE_LABEL.TEXT_SIZE),
        );
        labels
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', fill)
            .attr('font-weight', 'bold')
            .style('pointer-events', 'none');
        return labels;
    }

    /**
     * One value pill — a rounded rect with the value centred in it — as a keyed
     * join, shared by the class head and the student's pill so both keep the same
     * measured geometry and only differ in paint and placement.
     * @param {Array<object>} data - Rows to join.
     * @param {object} o - Options.
     * @param {string} o.rectSelector - Class the rects are joined on.
     * @param {string} o.textSelector - Class the texts are joined on.
     * @param {(d: any) => string} o.classSuffix - Per-row class suffix.
     * @param {(d: any) => number} o.getLeft - Left edge of the pill.
     * @param {(d: any) => number} o.getTop - Top edge of the pill.
     * @param {(d: any) => number} o.getValue - The value the pill shows.
     * @param {(d: any) => string} o.fill - Pill fill.
     * @param {(d: any) => string} o.stroke - Pill outline.
     * @param {number} o.strokeWidth - Outline width.
     * @param {string} o.textFill - Text colour.
     * @param {number} o.duration - Transition duration in ms.
     * @param {string} o.transitionName - Named transition key.
     * @returns {{rects: d3.Selection, labels: d3.Selection}} The joined rects and texts.
     */
    #joinValuePill(
        data,
        {
            rectSelector,
            textSelector,
            classSuffix,
            getLeft,
            getTop,
            getValue,
            fill,
            stroke,
            strokeWidth,
            textFill,
            duration,
            transitionName,
        },
    ) {
        const headSize = this.chartState.renderState?.headSize || this.#resolveLollipopHeadSize();
        const key = (d) => d.key;
        const getCenterX = (d) => getLeft(d) + headSize.width / 2;
        const getCenterY = (d) => getTop(d) + headSize.height / 2;

        const rects = this.g
            .selectAll(`.${rectSelector}`)
            .data(data, key)
            .join(
                (enter) =>
                    enter
                        .append('rect')
                        .attr('class', (d) => `${rectSelector}${classSuffix(d)}`)
                        .attr('x', getLeft)
                        .attr('y', getTop)
                        .attr('width', headSize.width)
                        .attr('height', headSize.height)
                        .attr('rx', headSize.rx)
                        .attr('ry', headSize.ry)
                        .attr('fill', fill)
                        .attr('stroke', stroke)
                        .attr('stroke-width', strokeWidth),
                (update) => {
                    update.interrupt(transitionName);
                    return this.maybeTransition(update, transitionName, duration)
                        .attr('x', getLeft)
                        .attr('y', getTop)
                        .attr('width', headSize.width)
                        .attr('height', headSize.height)
                        .attr('rx', headSize.rx)
                        .attr('ry', headSize.ry)
                        .attr('fill', fill)
                        .attr('stroke', stroke);
                },
                (exit) => exit.remove(),
            );

        const labels = this.g
            .selectAll(`.${textSelector}`)
            .data(data, key)
            .join(
                (enter) =>
                    enter
                        .append('text')
                        .attr('class', (d) => `${textSelector}${classSuffix(d)}`)
                        .attr('x', getCenterX)
                        .attr('y', getCenterY)
                        .text((d) => this.#formatValueLabel(getValue(d))),
                (update) => {
                    update.interrupt(transitionName);
                    this.maybeTransition(update, transitionName, duration)
                        .attr('x', getCenterX)
                        .attr('y', getCenterY);
                    return update.text((d) => this.#formatValueLabel(getValue(d)));
                },
                (exit) => exit.remove(),
            );
        this.#styleValueLabels(labels, textFill);

        return { rects, labels };
    }

    /**
     * The domain tag reads over the stem: ink on a surface-coloured halo.
     * @param {d3.Selection} tags - The tag texts.
     * @returns {d3.Selection} The same selection.
     */
    #styleDomainTags(tags) {
        this.applyChartTextSize(
            tags,
            /** @type {'sm'|'base'|'lg'} */ (CHART_CONFIG.VALUE_LABEL.TEXT_SIZE),
        );
        const { chrome } = getThemeColors();
        tags.attr('text-anchor', 'start')
            .attr('dominant-baseline', 'central')
            .attr('fill', chrome.text)
            .attr('font-weight', 'bold')
            .attr('stroke', chrome.surface)
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .style('pointer-events', 'none');
        return tags;
    }

    #resolveGroupedBandScales(chartHeight, headSize) {
        const groupLabels = this.categories.map((c) => c.label);
        const domainKeys = this.enConfig.domainIds;
        const requiredCenterGap = headSize.height + CHART_CONFIG.HEAD.MIN_PAIR_CLEARANCE;

        let fallback = null;
        for (const candidate of CHART_CONFIG.GROUPED_BANDS.PADDING_CANDIDATES) {
            const yScaleOuter = d3
                .scaleBand()
                .domain(groupLabels)
                .range([0, chartHeight])
                .paddingInner(candidate.outerInner)
                .paddingOuter(candidate.outerOuter);

            const yScaleInner = d3
                .scaleBand()
                .domain(domainKeys)
                .range([0, yScaleOuter.bandwidth()])
                .padding(candidate.inner);

            fallback = { yScaleOuter, yScaleInner };

            if (yScaleInner.step() >= requiredCenterGap) {
                return fallback;
            }
        }

        return fallback;
    }

    /**
     * Minimum chart-height (row-band area only, excluding axis/legend chrome) below
     * which the current mode's lollipop rows can no longer fit at their own minimum
     * size. Inverts the same d3.scaleBand math used in #renderSingleDomainChart /
     * #resolveGroupedBandScales, so it stays in sync with the actual row layout.
     * Grouped mode targets the loosest padding candidate (index 0) rather than the
     * tightest fallback, so the computed minimum still looks comfortable, not just
     * technically non-overlapping.
     * @param {boolean} isGrouped - Whether both domains share a row band, which halves the space each mark gets.
     * @param {number} categoryCount - Number of style categories, i.e. rows.
     * @param {{width: number, height: number, rx: number, ry: number, rightReserve: number}} headSize - Measured lollipop head; only its `height` enters the calculation.
     * @returns {number} The smallest chart height in px at which the rows still fit.
     */
    #computeMinChartHeight(isGrouped, categoryCount, headSize) {
        if (!isGrouped) {
            const p = CHART_CONFIG.SINGLE_BAND.PADDING;
            // With a student, a row must also hold the lifted pill above the stem:
            // the stem sits at the band centre, so the band needs a pill height plus
            // gap on either side of the class pill to keep the lifted one inside.
            const bandHeight = this.studentId
                ? headSize.height * 3 + CHART_CONFIG.STUDENT.LIFT_GAP * 2
                : headSize.height;
            return (bandHeight * (categoryCount + p)) / (1 - p);
        }

        const { outerInner, outerOuter, inner } = CHART_CONFIG.GROUPED_BANDS.PADDING_CANDIDATES[0];
        const requiredCenterGap = headSize.height + CHART_CONFIG.HEAD.MIN_PAIR_CLEARANCE;
        return (
            (requiredCenterGap * (2 + inner) * (categoryCount - outerInner + 2 * outerOuter)) /
            (1 - outerInner)
        );
    }

    #buildLegendItems(isGrouped) {
        const items = [];

        if (isGrouped) {
            items.push(
                {
                    label: this.enConfig.domainLabels[0],
                    glossaryKey: GLOSSARY_KEYS.HOERVERSTEHEN,
                    symbol: 'circle',
                    color: this.colors.chart.domain0,
                    className: 'legend-domain0',
                },
                {
                    label: this.enConfig.domainLabels[1],
                    glossaryKey: GLOSSARY_KEYS.LESEVERSTEHEN,
                    symbol: 'circle',
                    color: this.colors.chart.domain1,
                    className: 'legend-domain1',
                },
            );
        }

        if (this.studentId) {
            // The pill in miniature: hollow, outlined in the row colour.
            const [, d1] = this.enConfig.domainIds;
            const rowColor =
                this.domain === d1 ? this.colors.chart.domain1 : this.colors.chart.domain0;
            items.push({
                label: EN_TERMS.STUDENT,
                symbol: 'rect',
                rx: CHART_CONFIG.HEAD.MIN_HEIGHT / 2,
                color: this.colors.chrome.surface,
                stroke: rowColor,
                strokeWidth: CHART_CONFIG.STUDENT.PILL_STROKE_WIDTH,
                className: 'legend-student',
            });
        }

        if (!isGrouped) {
            const [, d1] = this.enConfig.domainIds;
            items.push({
                label: this.styleAverages?.className,
                glossaryKey: GLOSSARY_KEYS.KLASSENSCHNITT,
                symbol: 'circle',
                color: this.domain === d1 ? this.colors.chart.domain1 : this.colors.chart.domain0,
                className: 'legend-class-lollipop',
            });
        }

        // One entry per delivered comparison group, in payload order.
        for (const group of this.comparisonGroups) {
            items.push({
                ...comparisonLegendEntry(group, this.colors),
                ...comparisonMarkerLegendPaint(group, this.colors),
                symbol: comparisonSeriesVisual(group).symbol,
                className: `${group.id}-legend`,
                opacity: this.visibilityState[group.id] ? 1 : CHART_CONFIG.LEGEND.HIDDEN_OPACITY,
            });
        }

        return items;
    }

    /**
     * Build the measured adaptive legend config for grouped and single-domain modes.
     * @param {boolean} isGrouped - Selects the entry set: one per domain, or one per style shade.
     * @param {number} availableWidth - Width the legend may occupy, which decides its column count.
     * @param {number} symbolSize - Swatch size, matched to the marks the legend stands for.
     * @returns {{items: Array<object>, layout: object, symbolSize: number}} Entries plus the measured layout the legend renderer consumes.
     */
    #buildLegendConfig(isGrouped, availableWidth, symbolSize) {
        const items = this.#buildLegendItems(isGrouped);
        return {
            items,
            layout: this.legend.resolveAdaptiveLegendLayout(items, availableWidth, {
                defaultSymbolSize: symbolSize,
                columnGap: CHART_CONFIG.LEGEND.ITEM_SPACING / 2,
                // Clustered, not spread across the card: four captions 250 px apart
                // read as unrelated; a row with a fixed gap reads as one key.
                horizontalLayout: { distributeItems: false, itemGap: CHART_CONFIG.LEGEND.ITEM_GAP },
            }),
            symbolSize,
        };
    }

    /**
     * Generate color variations for domain
     * @param {string} baseColor - The domain's own colour, used unchanged for the first category.
     * @returns {string[]} Three progressively darker shades; an unparseable colour yields three copies of the input rather than silently dropping the series.
     */
    #generateDomainColors(baseColor) {
        const c = d3.color(baseColor);
        if (!c) return [baseColor, baseColor, baseColor];
        return [baseColor, c.darker(0.3).toString(), c.darker(0.6).toString()];
    }

    /**
     * Create category definitions
     * @returns {Array<object>} One row descriptor per chart row — style categories in grouped mode, domain-qualified categories otherwise.
     */
    #createCategoryDefinitions() {
        const cats = this.enConfig.styleCategories;

        // When domain is null (grouped mode), return style-based categories
        // Each style will have two bars (one per domain)
        if (!this.domain) {
            return cats.map((cat) => ({
                key: cat.value,
                label: cat.label,
                style: cat.value,
            }));
        }

        // Single domain mode - return domain-specific categories with varying colors
        const [d0] = this.enConfig.domainIds;
        const domainColors = this.#generateDomainColors(
            this.domain === d0 ? this.colors.chart.domain0 : this.colors.chart.domain1,
        );
        const domainName =
            this.domain === d0 ? this.enConfig.domainLabels[0] : this.enConfig.domainLabels[1];
        const abbreviatedDomainName = getChartDomainAbbreviation(domainName);

        return cats.map((cat, i) => ({
            key: `${this.domain}_${cat.value}`,
            label: `${domainName} ${cat.label}`,
            displayLabel: `${abbreviatedDomainName} ${cat.label}`,
            displayDomainLabel: abbreviatedDomainName,
            styleLabel: cat.label,
            domainGlossaryKey:
                this.domain === d0 ? GLOSSARY_KEYS.HOERVERSTEHEN : GLOSSARY_KEYS.LESEVERSTEHEN,
            domain: domainName,
            color: domainColors[i],
        }));
    }

    /**
     * Check if we're in grouped mode (showing both domains)
     * @returns {boolean} True when no domain filter is set, so both domains share each row.
     */
    #isGroupedMode() {
        return !this.domain;
    }

    renderChart() {
        // Cache colors in chartState for automatic cleanup
        this.chartState.cache.colors = getThemeColors(true);
        // Set colors alias immediately as it's needed by #createCategoryDefinitions()
        this.colors = this.chartState.cache.colors;

        // Calculate data - only calculate student performance if viewing individual student
        this.chartState.cache.categoryPerformance = this.studentId
            ? buildStyleCategoryPerformance(this.studentData, this.studentId, this.enConfig)
            : null;

        this.chartState.cache.classAverages = this.styleAverages.classAverages;
        this.chartState.cache.comparisonGroups = this.#resolveComparisonGroups(
            this.styleAverages.comparisonGroups,
        );
        this.chartState.cache.categories = this.#createCategoryDefinitions();

        // Set remaining local aliases for cached values (for cleaner code below)
        this.categoryPerformance = this.chartState.cache.categoryPerformance;
        this.classAverages = this.chartState.cache.classAverages;
        this.comparisonGroups = this.chartState.cache.comparisonGroups;
        this.categories = this.chartState.cache.categories;

        // Measure axis space from content
        const axisBottomSpace = measurePercentAxisSpace(this, 'bottom', {
            tickPadding: CHART_CONFIG.LAYOUT.BOTTOM_AXIS_TICK_PADDING,
        });
        const yMeasureLabels = this.categories.map((c) => c.displayLabel || c.label);
        const axisLeftSpace = measureCategoryAxisSpace(this, 'left', yMeasureLabels, {
            fontWeight: 'bold',
            tickPadding: 8,
            formatter: (v) => v,
        });

        const isGrouped = this.#isGroupedMode();
        const circleRadius = CHART_CONFIG.CIRCLE.RADIUS;
        const headSize = this.#resolveLollipopHeadSize();
        const legendAvailableWidth = this.legend.getAvailableLegendSlotWidth({
            left: axisLeftSpace,
            right: headSize.rightReserve,
        });
        const legendConfig = this.#buildLegendConfig(isGrouped, legendAvailableWidth, circleRadius);

        // Initialize SVG with layout system
        const { svg, g, layout } = this.initializeSVG({
            axisOverrides: {
                left: axisLeftSpace,
                right: headSize.rightReserve,
                bottom: axisBottomSpace,
            },
            legendConfigs: [legendConfig],
        });
        this.svg = svg;
        this.g = g;

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        const minChartHeight = this.#computeMinChartHeight(
            isGrouped,
            this.categories.length,
            headSize,
        );
        this.chartState.cache.requiredMinHeight = Math.ceil(
            minChartHeight + this.dimensions.margins.top + this.dimensions.margins.bottom,
        );

        const lineStrokeWidth = CHART_CONFIG.LINE.STROKE_WIDTH;

        // Create scales
        const xScale = d3.scaleLinear().domain([0, 100]).range([0, chartWidth]);

        this.xScale = xScale;

        // Store render state before initial element joins; the join helpers use it
        // for measured head geometry and incremental-update consistency.
        this.chartState.renderState = {
            isGrouped,
            xScale,
            chartWidth,
            chartHeight,
            layout,
            circleRadius,
            headSize,
            lineStrokeWidth,
            colors: this.colors,
        };

        if (isGrouped) {
            this.#renderGroupedChart(
                g,
                svg,
                xScale,
                chartWidth,
                chartHeight,
                layout,
                lineStrokeWidth,
            );
        } else {
            this.#renderSingleDomainChart(
                g,
                svg,
                xScale,
                chartWidth,
                chartHeight,
                layout,
                lineStrokeWidth,
            );
        }
        this.#addLegend(svg, legendConfig, layout);
    }

    /**
     * Render grouped chart with 2 bars per style.
     * Sets up scales and axes, then delegates to #updateElements(0)
     * so the same D3 join code is used for initial render and incremental updates.
     * @param {d3.Selection} g - The plot group rows and axes are drawn into.
     * @param {d3.Selection} svg - The chart root, used for elements that sit outside the plot group.
     * @param {d3.ScaleLinear<number, number>} xScale - Percentage scale shared by both domains.
     * @param {number} _chartWidth - Unused: the x scale already carries the width.
     * @param {number} chartHeight - Height the outer and inner band scales are fitted into.
     * @param {object} _layout - Unused: the measured layout is read from `chartState.renderState`.
     * @param {number} _lineStrokeWidth - Unused: the join helpers read it from `chartState.renderState`.
     */
    #renderGroupedChart(g, svg, xScale, _chartWidth, chartHeight, _layout, _lineStrokeWidth) {
        const bandScales = this.#resolveGroupedBandScales(
            chartHeight,
            this.chartState.renderState?.headSize || this.#resolveLollipopHeadSize(),
        );
        if (!bandScales) return;
        const { yScaleOuter, yScaleInner } = bandScales;

        this.yScale = yScaleOuter;
        this.yScaleInner = yScaleInner;

        // Add X-axis
        const xAxis = createPercentAxis('bottom', xScale, { step: 20 });

        g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(xAxis);

        // Add Y-axis (style labels)
        const yAxis = d3.axisLeft(yScaleOuter);

        g.append('g')
            .attr('class', 'y-axis')
            .call(yAxis)
            .selectAll('text')
            .attr('font-weight', 'bold')
            .attr('fill', this.colors.chrome.text)
            .each((d, i, nodes) => {
                const styleName = d?.toLowerCase?.();
                if (styleName) this.stampGlossaryAttr(d3.select(nodes[i]), styleName);
            });

        // Render data elements via D3 joins (duration=0 for instant)
        this.#updateElements(0);
    }

    /**
     * Build flat data array for grouped mode D3 joins.
     * One entry per (style × domain) combination, keyed for stable joins.
     * @returns {Array<object>} Row descriptors carrying the join key, both labels, the domain colour and the values to draw.
     */
    #buildGroupedData() {
        const [d0, d1] = this.enConfig.domainIds;
        const domainKeys = [d0, d1];
        const flat = [];
        const yScaleInner = this.yScaleInner;
        if (!yScaleInner) return flat;

        for (const category of this.categories) {
            for (const dk of domainKeys) {
                const avgKey = `${dk}_${category.style}`;
                const domainLabel =
                    dk === d0 ? this.enConfig.domainLabels[0] : this.enConfig.domainLabels[1];
                const color = dk === d0 ? this.colors.chart.domain0 : this.colors.chart.domain1;
                flat.push({
                    key: `${category.style}_${dk}`,
                    style: category.style,
                    styleLabel: category.label,
                    domainKey: dk,
                    domainLabel,
                    color,
                    value: finiteOrNull(this.classAverages[avgKey]),
                    studentValue: this.studentId
                        ? finiteOrNull(this.categoryPerformance?.[avgKey])
                        : null,
                    comparisons: this.#comparisonValuesFor(avgKey),
                    // Pre-computed pixel y (inner-band centre) for positioning
                    y:
                        (this.yScale(category.label) ?? 0) +
                        (yScaleInner(dk) ?? 0) +
                        yScaleInner.bandwidth() / 2,
                });
            }
        }
        return flat;
    }

    /**
     * Update all chart elements via D3 enter/update/exit joins — one code path for
     * both grouped (two domains per style) and single-domain modes. The modes differ
     * only in their data builder and a few per-mode values resolved up front: the
     * band-centre `getY`, the domain class suffix, the state-marker size, and the
     * student band height. Everything else (the join structure, hover wiring, value
     * labels, average markers, student markers) is shared.
     * Called with duration=0 for initial render, duration>0 for incremental updates.
     * @param {number} duration - Transition duration in ms
     */
    #updateElements(duration) {
        const isGrouped = this.#isGroupedMode();
        const data = isGrouped ? this.#buildGroupedData() : this.#buildSingleDomainData();
        // Stem and class pill need a class value; a row without one draws neither, while
        // its student pill and comparison markers still draw from their own values.
        const classData = data.filter((d) => d.value !== null);
        const rs = this.chartState.renderState || {};
        const xScale = rs.xScale || this.xScale;
        const circleRadius = rs.circleRadius || CHART_CONFIG.CIRCLE.RADIUS;
        const headSize = rs.headSize || this.#resolveLollipopHeadSize();
        const lineStrokeWidth = rs.lineStrokeWidth || CHART_CONFIG.LINE.STROKE_WIDTH;

        const key = (d) => d.key;
        // Grouped entries carry a pre-computed inner-band centre `y`; single-domain
        // entries derive it from the band scale (which is only set after the data is
        // first built, so it cannot be baked into #buildSingleDomainData).
        const getY = isGrouped ? (d) => d.y : (d) => this.#getCategoryY(d.label);
        const getHeadX = (d) => xScale(d.value) - headSize.width / 2;
        const getHeadY = (d) => getY(d) - headSize.height / 2;
        const lineEnd = (d) =>
            d.studentValue !== null && d.studentValue > d.value ? d.studentValue : d.value;
        const classSuffix = isGrouped ? (d) => ` ${d.domainKey}` : () => '';
        const tooltipContent = isGrouped
            ? (d) =>
                  this.formatTooltipContent(
                      { styleLabel: d.styleLabel, domainData: d },
                      { type: 'grouped' },
                  )
            : (d) => this.formatTooltipContent(d, { type: 'single' });

        const indicatorSize = circleRadius * 0.8;
        const stateIndicatorSize = indicatorSize * (isGrouped ? 1.8 : 2);

        const MAIN = 'style-elements';
        const AVG = 'style-avg';

        // --- Lines ---
        const lines = this.g
            .selectAll('.lollipop-line')
            .data(classData, key)
            .join(
                (enter) =>
                    enter
                        .append('line')
                        .attr('class', (d) => `lollipop-line${classSuffix(d)}`)
                        .attr('x1', 0)
                        .attr('x2', (d) => xScale(lineEnd(d)))
                        .attr('y1', (d) => getY(d))
                        .attr('y2', (d) => getY(d))
                        .attr('stroke', (d) => d.color)
                        .attr('stroke-width', lineStrokeWidth),
                (update) => {
                    update.interrupt(MAIN);
                    return this.maybeTransition(update, MAIN, duration)
                        .attr('x2', (d) => xScale(lineEnd(d)))
                        .attr('stroke', (d) => d.color);
                },
                (exit) => exit.remove(),
            );

        // --- Lollipop heads: the class value as a filled pill on the stem end ---
        const { rects: heads, labels: valueLabels } = this.#joinValuePill(classData, {
            rectSelector: 'lollipop-head',
            textSelector: 'value-label',
            classSuffix,
            getLeft: getHeadX,
            getTop: getHeadY,
            getValue: (d) => d.value,
            fill: (d) => d.color,
            stroke: () => CHART_CONFIG.COLORS.WHITE,
            strokeWidth: CHART_CONFIG.CIRCLE.STROKE_WIDTH,
            textFill: CHART_CONFIG.COLORS.WHITE,
            duration,
            transitionName: MAIN,
        });

        // Wire coordinated hover for stem+head pairs
        this.wireLollipopPairEvents(lines, heads, {
            getTooltipContent: tooltipContent,
            head: this.#getHeadHoverConfig(getHeadX, getHeadY, headSize),
            tooltipId: 'en-style-lollipop',
        });

        // --- Domain tags (grouped mode): the letter at the stem base says which of
        // the two bars in a row is which, so the pair is not told apart by colour alone.
        const domainTags = this.g
            .selectAll('.domain-tag')
            .data(isGrouped ? data : [], key)
            .join(
                (enter) =>
                    enter
                        .append('text')
                        .attr('class', (d) => `domain-tag${classSuffix(d)}`)
                        .attr('x', CHART_CONFIG.DOMAIN_TAG.X)
                        .attr('y', (d) => getY(d))
                        .text((d) => getChartDomainAbbreviation(d.domainLabel, { length: 1 })),
                (update) => {
                    update.interrupt(MAIN);
                    this.maybeTransition(update, MAIN, duration).attr('y', (d) => getY(d));
                    return update.text((d) =>
                        getChartDomainAbbreviation(d.domainLabel, { length: 1 }),
                    );
                },
                (exit) => exit.remove(),
            );
        this.#styleDomainTags(domainTags);

        // --- One marker series per delivered comparison group ---
        // A marker that would land under the class pill drops just below the stem
        // instead, so the class value stays legible and the marker stays on its x.
        const markerY = (d, x, size) =>
            d.value !== null && Math.abs(x - xScale(d.value)) < headSize.width / 2 + size
                ? getY(d) + headSize.height / 2 + size + CHART_CONFIG.STUDENT.LIFT_GAP
                : getY(d);
        for (const group of this.comparisonGroups) {
            const { symbol } = comparisonSeriesVisual(group);
            const paint = comparisonSeriesPaint(group, this.colors);
            const selector = `${group.id}-average-marker`;
            const size = symbol === 'square' ? stateIndicatorSize / 2 : indicatorSize;
            // A row the group has no value for gets no marker rather than one at 0 %.
            const groupData = data.filter((d) => d.comparisons[group.id] !== null);
            this.joinAverageMarker(this.g, groupData, {
                selector,
                classFn: (d) => `${selector}${classSuffix(d)}`,
                shape: symbol,
                key,
                getX: (d) => xScale(d.comparisons[group.id]),
                getY: (d) => markerY(d, xScale(d.comparisons[group.id]), size),
                size,
                fill: paint.fill,
                stroke: paint.hollow ? paint.stroke : CHART_CONFIG.COLORS.WHITE,
                strokeWidth: paint.hollow ? paint.strokeWidth : 1,
                dotFill: paint.dotFill,
                visible: () => this.visibilityState[group.id],
                visibleOpacity: CHART_CONFIG.AVERAGES.OPACITY,
                duration,
                transitionName: AVG,
                tooltip: { getTooltipContent: tooltipContent, tooltipId: 'en-style-lollipop' },
            });
        }

        // --- Student mark: a hollow pill on the value, same geometry as the class
        // pill and the same hue, so the person is told apart from the class by fill
        // mode. When the two pills would overlap, the student's rises straight off
        // the stem — its x stays on the value.
        const studentData = data.filter((d) => d.studentValue !== null);
        const { PILL_STROKE_WIDTH, LIFT_GAP } = CHART_CONFIG.STUDENT;
        const overlapsClass = (d) =>
            d.value !== null &&
            Math.abs(xScale(d.studentValue) - xScale(d.value)) <
                headSize.width + CHART_CONFIG.HEAD.MIN_PAIR_CLEARANCE;

        const { rects: studentPills, labels: studentLabels } = this.#joinValuePill(studentData, {
            rectSelector: 'student-head',
            textSelector: 'student-value-label',
            classSuffix,
            getLeft: (d) => xScale(d.studentValue) - headSize.width / 2,
            getTop: (d) =>
                overlapsClass(d) ? getHeadY(d) - headSize.height - LIFT_GAP : getHeadY(d),
            getValue: (d) => d.studentValue,
            fill: () => this.colors.chrome.surface,
            stroke: (d) => d.color,
            strokeWidth: PILL_STROKE_WIDTH,
            textFill: this.colors.chrome.text,
            duration,
            transitionName: MAIN,
        });
        // Re-wired on every update: d3's `.on` replaces a handler of the same type.
        this.wireTooltipEvents(studentPills, {
            getTooltipContent: tooltipContent,
            tooltipId: 'en-style-lollipop',
            interactive: true,
        });

        // Stacking, bottom up: class pill, then the student pill.
        heads.raise();
        valueLabels.raise();
        studentPills.raise();
        studentLabels.raise();
    }

    /**
     * Render single domain chart (original behavior).
     * Uses D3 join-based methods so the same code paths work for both
     * initial render (duration=0) and incremental data updates.
     * @param {d3.Selection} g - The plot group rows and axes are drawn into.
     * @param {d3.Selection} svg - The chart root, used for elements that sit outside the plot group.
     * @param {d3.ScaleLinear<number, number>} xScale - Percentage scale for the row values.
     * @param {number} _chartWidth - Unused: the x scale already carries the width.
     * @param {number} chartHeight - Height the row band scale is fitted into.
     * @param {object} _layout - Unused: the measured layout is read from `chartState.renderState`.
     * @param {number} _lineStrokeWidth - Unused: the join helpers read it from `chartState.renderState`.
     */
    #renderSingleDomainChart(g, svg, xScale, _chartWidth, chartHeight, _layout, _lineStrokeWidth) {
        const chartData = this.#buildSingleDomainData();

        const yScale = d3
            .scaleBand()
            .domain(chartData.map((d) => d.label))
            .range([0, chartHeight])
            .padding(CHART_CONFIG.SINGLE_BAND.PADDING);

        this.yScale = yScale;

        // Add axes (static — rebuilt on full re-render only)
        this.#createAxes(g, xScale, yScale, chartHeight);

        // Render via join-based methods with duration=0 (instant)
        this.#updateElements(0);
    }

    /**
     * Prepare chart data array for single-domain mode from current averages.
     * @returns {Array<object>} Chart data with key, label, value, averages
     */
    #buildSingleDomainData() {
        return this.categories.map((category) => ({
            ...category,
            value: finiteOrNull(this.classAverages[category.key]),
            studentValue: this.studentId
                ? finiteOrNull(this.categoryPerformance?.[category.key])
                : null,
            comparisons: this.#comparisonValuesFor(category.key),
        }));
    }

    /**
     * Create axes
     * @param {d3.Selection} g - The plot group both axis groups are appended to.
     * @param {d3.ScaleLinear<number, number>} xScale - Percentage scale for the value axis.
     * @param {d3.ScaleBand<string>} yScale - Row band scale for the category axis.
     * @param {number} chartHeight - Where the bottom axis is translated to.
     */
    #createAxes(g, xScale, yScale, chartHeight) {
        // X-axis
        const xAxis = createPercentAxis('bottom', xScale, { step: 20 });

        g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(xAxis);

        // Y-axis
        const yAxis = d3.axisLeft(yScale);

        const yAxisGroup = g.append('g').attr('class', 'y-axis').call(yAxis);

        // Build lookup from label string → category definition
        const catMap = new Map(this.categories.map((c) => [c.label, c]));

        yAxisGroup
            .selectAll('text')
            .attr('font-weight', 'bold')
            .attr('fill', this.colors.chrome.text)
            .each((d, i, nodes) => {
                const cat = catMap.get(d);
                if (cat?.displayLabel) {
                    const textEl = d3.select(nodes[i]);
                    const segments = [
                        { text: cat.displayDomainLabel, glossaryKey: cat.domainGlossaryKey },
                        { text: ' ', glossaryKey: null },
                        ...this.getGlossaryTextSegments(cat.styleLabel || cat.label),
                    ];

                    this.renderGlossaryTextSegments(textEl, cat.displayLabel, {
                        segments,
                        force: true,
                    });
                } else {
                    // Grouped mode: single line, stamp glossary on full label
                    const styleName = d?.toLowerCase?.();
                    if (styleName) this.stampGlossaryAttr(d3.select(nodes[i]), styleName);
                }
            });
    }

    #addLegend(svg, legendConfig, layout) {
        const slot = layout.legends[0];
        const resolvedLegendConfig = this.legend.resolveLegendLayoutForSlot(legendConfig, slot);
        this.legend.createLegend({
            svg,
            ...resolvedLegendConfig,
        });
    }

    /**
     * Rebuild the legend after an incremental data update.
     * Removes the existing legend group and recreates it.
     */
    #rebuildLegend() {
        if (!this.svg) return;
        const rs = this.chartState.renderState;
        if (!rs) return;

        // Remove existing legend
        this.svg.selectAll('.legend').remove();

        const { layout, circleRadius } = rs;
        const legendConfig = this.#buildLegendConfig(
            this.#isGroupedMode(),
            layout.legends?.[0]?.width ?? this.dimensions.containerWidth,
            circleRadius,
        );
        this.#addLegend(this.svg, legendConfig, layout);
    }

    /**
     * Get visibility config for lollipop chart elements
     * @override
     * @protected
     * @returns {object} Config for applyVisibilityTransitions()
     */
    _getVisibilityConfig() {
        return {
            elements: {
                ...Object.fromEntries(
                    this.comparisonGroups.map((group) => [
                        group.id,
                        this.svg.selectAll(`.${CSS.escape(group.id)}-average-marker`),
                    ]),
                ),
            },
            legends: {
                ...Object.fromEntries(
                    this.comparisonGroups.map((group) => [
                        group.id,
                        this.svg.select(`.${CSS.escape(group.id)}-legend`),
                    ]),
                ),
            },
            visibilityState: this.visibilityState,
            hiddenOpacity: CHART_CONFIG.LEGEND.HIDDEN_OPACITY,
            visibleOpacity: CHART_CONFIG.AVERAGES.OPACITY,
        };
    }
}
