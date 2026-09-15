/**
 * Scatterplot Chart - ChartRenderer Implementation
 * Shows student performance across two domains with GER levels and comparison averages
 *
 * Chart Design: Square chart area centered in container with legend below
 * Shows student points, GER threshold lines/labels, and comparison averages (class/school/state)
 */

import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { ensureHeaderActionButton } from '../../../../common/charts/host/chartHeaderControls.js';
import { getTrianglePath, HIDDEN_LEGEND_OPACITY } from '../../../../common/charts/markerSymbols.js';
import { motionDuration } from '../../../../common/charts/motionPreference.js';
import { getLevelGlossaryKey } from '../../../../common/services/competenceLevelPalette.js';
import { getCompetencyColor, getThemeColors } from '../../../../common/services/themeService.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    getResponsiveTickCount,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { EN_TERMS } from '../../../enTerms.js';
import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';
import { buildJitterCacheKey, isJitterCacheValid, simulateJitter } from './scatterJitter.js';
import { calculateZoomDomain, dataCoversAllCompetencyLevels } from './scatterZoomDomain.js';
import { ScatterSelectionController } from './scatterSelectionController.js';
import {
    comparisonLegendEntry,
    comparisonMarkerLegendPaint,
    comparisonSeriesVisual,
} from '../../../../common/charts/comparisonSeries.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import {
    LEGEND_SYMBOL_TEXT_GAP,
    LEGEND_COLUMN_GAP,
    SCATTERPLOT_TOOLTIP_ID,
    CLASS_VISUAL,
    CHART_CONFIG,
} from './scatterplotConstants.js';
import {
    hasDrawableClassAverage,
    markerPath,
    averageMarkerTagPosition,
    renderAveragePoints,
} from './scatterAverageMarkers.js';
import * as d3 from 'd3';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import { initialActiveModes } from '../../../../common/charts/comparisonState.js';

/** The band swatch beside a level label on the frame, px. */
const BAND_SWATCH = Object.freeze({ SIZE: 8, GAP: 4 });

// ============================================================================
// SCATTERPLOT CHART CLASS
// ============================================================================

/**
 * Scatterplot - Shows student performance across two domains
 * @augments ChartRenderer
 */
export class Scatterplot extends ChartRenderer {
    // Private fields
    /** @type {{data: any[]|null, xDomain: string|null, yDomain: string|null, xRange: string|null, yRange: string|null, dataHash: string|null}} */
    #jitterCache;
    /** @type {{domain0Color: any, domain1Color: any}|null} */
    #renderParams = null;
    /** @type {any[]|null} */
    #scatterplotData = null;
    /** @type {HTMLButtonElement|null} */
    #zoomButton = null;
    /** @type {ScatterSelectionController} Owns selection state + the marquee interaction. */
    #selection;
    /** @type {Function|null} */
    #onStudentClick = null;

    constructor(containerId, options = {}) {
        options.enConfig.assertExactlyTwoDomains();

        super(containerId, {
            defaultWidth: CHART_CONFIG.DEFAULTS.WIDTH,
            defaultHeight: CHART_CONFIG.DEFAULTS.HEIGHT,
            ...options,
            // Selection installs its own marquee handlers on the SVG, which a
            // resize-driven re-render would throw away.
            autoResize: !options.enableSelection,
            layout: chartLayoutPreset('squareBottomLegend'),
        });

        this.enConfig = options.enConfig;
        // Chart data — points, already adapted from student records by enScatterPointAdapter.
        this.points = options.points || [];
        this.domainColors = {
            get ho() {
                return getThemeColors().chart.domain0;
            },
            get le() {
                return getThemeColors().chart.domain1;
            },
        };
        this.domainTitles =
            options.domainTitles ||
            (() => {
                const [d0, d1] = this.enConfig.domainIds;
                return { [d0]: 'Domain0', [d1]: 'Domain1' };
            })();
        this.gerThresholds = options.gerThresholds ?? {};
        const [_d0, _d1] = this.enConfig.domainIds;
        this.classAverages = options.classAverages || { [_d0]: 0, [_d1]: 0 };
        this.classLabel = options.classLabel ?? null;
        // One entry per delivered comparison group. No defaults: a group the payload
        // does not carry gets no marker, rather than a marker at an invented value.
        this.comparisons = options.comparisons || [];
        this.startZoomed = options.startZoomed || false;

        // Selection options
        this.enableSelection = options.enableSelection || false;
        this.#selection = new ScatterSelectionController({
            selectedIds: this.enableSelection ? options.selectedStudentIds || [] : [],
            onSelectionChanged: this.enableSelection ? options.onSelectionChanged || null : null,
            createTooltip: (id, opts) => this.createTooltip(id, opts),
            hideTooltip: (tooltip) => this.hideTooltip(tooltip),
            selectionConfig: CHART_CONFIG.SELECTION,
            tooltipId: SCATTERPLOT_TOOLTIP_ID,
        });

        // Click callback for non-selection mode
        this.#onStudentClick = options.onStudentClick || null;

        // Visibility state - use inherited ChartRenderer method
        this.comparisonModes = this.enConfig.comparisonModeIds;
        this.visibilityState = this.initVisibilityState(
            this.comparisonModes,
            initialActiveModes(options),
            { includeStudent: true, includeClass: true },
        );

        // Store zoom state and scales in chartState for automatic cleanup
        this.chartState.zoom = {
            isZoomed: false,
            originalXDomain: [0, 100],
            originalYDomain: [0, 100],
        };
        this.chartState.scales = {
            x: null,
            y: null,
        };

        // Jitter cache for performance optimization
        this.#jitterCache = {
            data: null,
            xDomain: null,
            yDomain: null,
            xRange: null,
            yRange: null,
            dataHash: null,
        };
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    getInitialState() {
        const activeComparisons = initialActiveModes(this.options);
        return { activeModes: activeComparisons };
    }

    _onStateChanged(changedKeys, _prevState) {
        if (changedKeys.includes('activeModes')) {
            super._onStateChanged(changedKeys, _prevState);
            return;
        }
        this.refresh();
    }

    /**
     * Get visibility config mapping CSS selectors to visibility keys.
     * @override
     * @protected
     * @returns {object} Config for applyVisibilityTransitions()
     */
    _getVisibilityConfig() {
        const elements = { class: this.svg.selectAll('.class-average-point') };
        const legends = { class: this.svg.select('.class-legend') };
        for (const group of this.comparisons) {
            const escaped = CSS.escape(group.id);
            // Markers only — the ordinal tags fade with them, but via
            // #applyTagVisibility() rather than the shared element path. See there.
            elements[group.id] = this.svg.selectAll(
                `.comparison-average-point[data-group-id="${escaped}"], .comparison-average-dot[data-group-id="${escaped}"]`,
            );
            legends[group.id] = this.svg.select(`.comparison-legend[data-group-id="${escaped}"]`);
        }

        return {
            elements,
            legends,
            visibilityState: this.visibilityState,
            visibleOpacity: CHART_CONFIG.AVERAGES.OPACITY,
            hiddenOpacity: HIDDEN_LEGEND_OPACITY,
        };
    }

    /**
     * @override
     * @param {object} config - See {@link ChartRenderer#applyVisibilityTransitions}
     */
    applyVisibilityTransitions(config) {
        super.applyVisibilityTransitions(config);
        this.#applyTagVisibility(config);
    }

    /**
     * Fade the ordinal tags with their markers — a stray `L2` floating over an empty
     * plot would read as a value that is still there — without routing them through
     * `setElementVisibility()`, which grants `pointer-events: auto` to everything it
     * shows. The tags are decorative labels drawn on top of the point cloud: made
     * hoverable they become dead zones that swallow the tooltips of the student
     * points beneath them. Re-asserting `none` afterwards does not work either,
     * because that style is applied *through* the transition and so lands last.
     * @param {object} config - The visibility config the shared pass just used.
     * @param {number} [config.duration] - Fade length in ms; `0` applies the opacity immediately.
     * @param {number} [config.visibleOpacity] - Opacity a shown tag settles at, matching its marker.
     */
    #applyTagVisibility({ duration = ChartRenderer.TRANSITION_DURATION, visibleOpacity = 1 }) {
        for (const group of this.comparisons) {
            const visible = this.visibilityState[group.id];
            if (visible === undefined) continue;

            const tags = this.svg.selectAll(
                `.comparison-average-tag[data-group-id="${CSS.escape(group.id)}"]`,
            );
            const target = duration > 0 ? this.transition(tags, duration) : tags;
            target.style('opacity', visible ? visibleOpacity : 0);
        }
    }

    // Required abstract methods
    validateData() {
        return this.points.length > 0;
    }

    // ========================================================================
    // TOOLTIP CONTENT
    // ========================================================================

    /**
     * Format tooltip content based on the type of data point
     * @override
     * @param {object} segment - The data point
     * @param {object} context - Additional context: `type: 'student'`, `type: 'class'`,
     *        or `groupId` naming one of the delivered comparison groups
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        const { type, groupId } = context;
        const [d0, d1] = this.enConfig.domainIds;

        if (groupId) {
            const group = this.comparisons.find((g) => g.id === groupId);
            if (!group) return '';
            return this.buildTooltipHTML({
                title: group.name,
                rows: [
                    {
                        label: this.domainTitles[d1],
                        value: `${group.domainAverages[d1].toFixed(1)}%`,
                    },
                    {
                        label: this.domainTitles[d0],
                        value: `${group.domainAverages[d0].toFixed(1)}%`,
                    },
                ],
            });
        }

        switch (type) {
            case 'class':
                return this.buildTooltipHTML({
                    title: this.classLabel ?? 'class',
                    rows: [
                        {
                            label: this.domainTitles[d1],
                            value: `${this.classAverages[d1].toFixed(1)}%`,
                        },
                        {
                            label: this.domainTitles[d0],
                            value: `${this.classAverages[d0].toFixed(1)}%`,
                        },
                    ],
                });

            case 'student':
            default:
                return this.buildTooltipHTML({
                    title: `${segment.firstName} ${segment.lastName}`,
                    rows: [
                        {
                            label: this.domainTitles[d1],
                            value: `${segment.d1Percentage.toFixed(1)}%`,
                        },
                        {
                            label: this.domainTitles[d0],
                            value: `${segment.d0Percentage.toFixed(1)}%`,
                        },
                        { label: `${this.domainTitles[d1]} GER`, value: segment.d1Ger },
                        { label: `${this.domainTitles[d0]} GER`, value: segment.d0Ger },
                    ],
                });
        }
    }

    // ========================================================================
    // DATA & HELPERS
    // ========================================================================

    /**
     * Get valid threshold values for both domains.
     * @returns {{x: number[], y: number[]}} Threshold positions in percent per axis, with the 0/100 edges dropped because a line on the axis itself carries no information.
     */
    #getValidThresholds() {
        const [d0, d1] = this.enConfig.domainIds;
        const d0Thresholds = this.gerThresholds?.[d0];
        const d1Thresholds = this.gerThresholds?.[d1];

        return {
            x: d0Thresholds
                ? d0Thresholds.ksPercentageThresholds
                      .map((t) => parseFloat(t))
                      .filter((t) => t > 0 && t < 100)
                : [],
            y: d1Thresholds
                ? d1Thresholds.ksPercentageThresholds
                      .map((t) => parseFloat(t))
                      .filter((t) => t > 0 && t < 100)
                : [],
        };
    }

    // Main render method
    renderChart() {
        const scatterplotData = this.points;
        this.#scatterplotData = scatterplotData;

        const thresholds = this.#getValidThresholds();
        const xThresholdTexts = thresholds.x.map((d) => `${d}%`);
        const yThresholdTexts = thresholds.y.map((d) => `${d}%`);
        const xThresholdLabelHeight =
            xThresholdTexts.length > 0 ? this.measureTexts(xThresholdTexts).maxHeight : 0;
        const yThresholdLabelWidth =
            yThresholdTexts.length > 0 ? this.measureTexts(yThresholdTexts).maxWidth : 0;

        const axisBottomSpace = measurePercentAxisSpace(this, 'bottom', {
            axisTitleText: this.domainTitles[this.enConfig.domainIds[0]],
        });
        const axisLeftSpace = measurePercentAxisSpace(this, 'left', {
            axisTitleText: this.domainTitles[this.enConfig.domainIds[1]],
        });
        const axisTopSpace = Math.max(30, Math.ceil(xThresholdLabelHeight + 10));
        const axisRightSpace = Math.max(30, Math.ceil(yThresholdLabelWidth + 15));

        // One theme snapshot per render, handed to `comparisonSeries` at the point of
        // use, so a new role needs no per-chart color-map edit (an unmapped key used to
        // yield an undefined fill: SVG-default black, reading as a Schulschnitt).
        const theme = getThemeColors(true);
        const studentColor = theme.chart.studentPoint;
        const legendItems = this.#buildLegendItems(theme);
        const legendAvailableWidth = this.legend.getAvailableLegendSlotWidth({
            left: axisLeftSpace,
            right: axisRightSpace,
        });
        const legendConfig = this.#buildLegendConfig(legendItems, legendAvailableWidth);

        const { svg, g, layout } = this.initializeSVG({
            axisOverrides: {
                left: axisLeftSpace,
                bottom: axisBottomSpace,
                top: axisTopSpace,
                right: axisRightSpace,
            },
            legendConfigs: [legendConfig],
        });

        this.svg = svg;
        this.g = g;

        const chartSize = layout.chart.width;
        this.chartSize = chartSize;

        const [domain0Id, domain1Id] = this.enConfig.domainIds;
        const domain0Color = this.domainColors[domain0Id] || theme.chart.domain0;
        const domain1Color = this.domainColors[domain1Id] || theme.chart.domain1;

        let xDomain = this.chartState.zoom.originalXDomain;
        let yDomain = this.chartState.zoom.originalYDomain;

        if (this.startZoomed) {
            const zoomDomain = this.#calculateZoomDomain(scatterplotData);
            xDomain = [zoomDomain.xMin, zoomDomain.xMax];
            yDomain = [zoomDomain.yMin, zoomDomain.yMax];
            this.chartState.zoom.isZoomed = true;
        }

        this.chartState.scales.x = d3.scaleLinear().domain(xDomain).range([0, chartSize]);

        this.chartState.scales.y = d3.scaleLinear().domain(yDomain).range([chartSize, 0]);

        this.xScale = this.chartState.scales.x;
        this.yScale = this.chartState.scales.y;

        this.#createAxesWithThresholds(g, domain0Color, domain1Color, chartSize);

        const [xDomMin, xDomMax] = this.xScale.domain();
        const visibleXThresholds = thresholds.x.filter((t) => t >= xDomMin && t <= xDomMax);
        let hoerLabelX = chartSize;
        if (visibleXThresholds.length) {
            const maxXT = Math.max(...visibleXThresholds);
            for (const node of g.select('.x-axis').selectAll('.tick').nodes()) {
                if (d3.select(node).datum() === maxXT) {
                    const textNode = d3.select(node).select('text').node();
                    if (textNode) {
                        const halfWidth =
                            (/** @type {SVGTextElement} */ (textNode).getComputedTextLength?.() ||
                                0) / 2;
                        hoerLabelX = this.xScale(maxXT) + halfWidth;
                    }
                    break;
                }
            }
        }

        g.append('text')
            .attr('class', 'axis-label-x')
            .attr('x', hoerLabelX)
            .attr('y', chartSize - 6)
            .style('text-anchor', 'end')
            .style('font-weight', 'bold')
            .style('fill', theme.chrome.text)
            .text(this.domainTitles[this.enConfig.domainIds[0]])
            .call((sel) => this.stampGlossaryAttr(sel, GLOSSARY_KEYS.HOERVERSTEHEN));

        g.append('text')
            .attr('class', 'axis-label-y')
            .attr('x', 5)
            .attr('y', 0)
            .style('text-anchor', 'start')
            .style('font-weight', 'bold')
            .style('fill', theme.chrome.text)
            .text(this.domainTitles[this.enConfig.domainIds[1]])
            .call((sel) => this.stampGlossaryAttr(sel, GLOSSARY_KEYS.LESEVERSTEHEN));

        renderAveragePoints(this, g, theme);
        this.#addCompetencyLabels(g);
        this.#renderStudentPoints(g, scatterplotData, studentColor);
        this.#createLegend(svg, legendConfig);

        this.#renderParams = {
            domain0Color,
            domain1Color,
        };

        if (this.startZoomed) {
            this.#updateZoomButtonState(true);
        }
    }

    /**
     * Create axes with integrated GER threshold ticks.
     * @param {d3.Selection} g - The plot group both axes are appended to.
     * @param {string} domain0Color - Accent for the x-axis thresholds, the first domain's colour.
     * @param {string} domain1Color - Accent for the y-axis thresholds, the second domain's colour.
     * @param {number} chartSize - Side length of the square plot area, used to stretch threshold ticks across it.
     */
    #createAxesWithThresholds(g, domain0Color, domain1Color, chartSize) {
        const { x: xThresholds, y: yThresholds } = this.#getValidThresholds();

        const xAxisGroup = g
            .append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0, ${this.chartSize})`)
            .call(
                createPercentAxis('bottom', this.xScale, {
                    tickValues: this.#computeAllTicks(this.xScale, xThresholds),
                }),
            );
        this.#styleThresholdAxis(xAxisGroup, {
            axis: 'x',
            thresholds: xThresholds,
            accentColor: domain0Color,
            chartSize,
        });

        const yAxisGroup = g
            .append('g')
            .attr('class', 'y-axis')
            .call(
                createPercentAxis('left', this.yScale, {
                    tickValues: this.#computeAllTicks(this.yScale, yThresholds),
                }),
            );
        this.#styleThresholdAxis(yAxisGroup, {
            axis: 'y',
            thresholds: yThresholds,
            accentColor: domain1Color,
            chartSize,
        });
    }

    /**
     * Merge regular axis ticks with GER threshold values, clamp to the scale's
     * current domain, and sort ascending.
     * @param {d3.ScaleLinear<number, number>} scale - The axis scale, read for both its domain and its own tick suggestions.
     * @param {number[]} thresholds - Band boundaries in percent that must appear as ticks even when the scale would not pick them.
     * @returns {number[]} The merged tick values, ascending and clipped to the visible domain.
     */
    #computeAllTicks(scale, thresholds) {
        const [min, max] = scale.domain();
        const regular = scale.ticks(getResponsiveTickCount(this.dimensions));
        return [...new Set([...regular, ...thresholds])]
            .filter((t) => t >= min && t <= max)
            .sort((a, b) => a - b);
    }

    /**
     * Apply the shared threshold tick-styling rules to one axis group. Single
     * source of truth for both the initial (immediate) and zoom (transition) paths
     * — pass `duration` to animate. Threshold ticks use the accent color and the
     * extended cross-chart guide geometry; regular ticks use the muted defaults.
     * @param {d3.Selection} axisGroup - The rendered axis group whose ticks are restyled in place.
     * @param {object} spec - Which axis is being styled and how its threshold ticks should read.
     * @param {'x'|'y'} spec.axis - Selects the tick geometry: `x` guides run upward, `y` guides run to the right.
     * @param {number[]} spec.thresholds - Tick values that mark a band boundary and get the accent treatment.
     * @param {string} spec.accentColor - Colour of the threshold ticks, the axis's own domain colour.
     * @param {number} spec.chartSize - Side length of the plot area, the length a threshold guide spans.
     * @param {number} [spec.duration] - Transition length in ms; `0` restyles immediately.
     */
    #styleThresholdAxis(axisGroup, { axis, thresholds, accentColor, chartSize, duration = 0 }) {
        const isThr = (d) => thresholds.includes(d);
        const textColor = getThemeColors().chrome.text;
        const animate = (sel) => (duration > 0 ? sel.transition().duration(duration) : sel);

        const tickText = axisGroup.selectAll('.tick text');
        const tickLine = axisGroup.selectAll('.tick line');

        // A threshold tick draws its guide across the plot but prints no value: the
        // exact cut score lives in the tooltip and the Äquivalenztabelle, and a
        // second row of figures on the frame only competed with the axis.
        tickText.style('display', (d) => (isThr(d) ? 'none' : null)).style('fill', textColor);

        const tickLineAnim = animate(tickLine)
            .style('stroke', (d) => (isThr(d) ? accentColor : textColor))
            .style('stroke-width', (d) => (isThr(d) ? '2px' : '1px'))
            .style('stroke-dasharray', (d) => (isThr(d) ? '4,2' : null));

        if (axis === 'x') {
            tickLineAnim.attr('y2', (d) => (isThr(d) ? -chartSize : 6));
        } else {
            tickLineAnim.attr('x2', (d) => (isThr(d) ? chartSize : -6));
        }

        // Line opacity is always applied immediately (never transitioned) in both paths.
        tickLine.style('opacity', (d) => (isThr(d) ? 0.7 : 1));
    }

    /**
     * Add GER competency level labels
     * @param {d3.Selection} g - The plot group the band labels are appended to.
     */
    #addCompetencyLabels(g) {
        const [d0, d1] = this.enConfig.domainIds;
        const d0Thresholds = this.gerThresholds?.[d0];
        const d1Thresholds = this.gerThresholds?.[d1];

        // Guarded per axis, not jointly: a domain whose payload ships no equivalence
        // table has no bands to label, but that must not silence the other domain's.
        if (!d0Thresholds && !d1Thresholds) return;

        // Get current scale domains for visibility check
        const xDomain = this.xScale.domain();
        const yDomain = this.yScale.domain();

        // X-axis (first domain) labels - each label centered within its band
        const d0Bands = [
            0,
            ...(d0Thresholds?.ksPercentageThresholds ?? []).map((t) => parseFloat(t)),
            100,
        ];
        (d0Thresholds?.ks ?? []).forEach((ger, i) => {
            const lowerBound = d0Bands[i];
            const upperBound = d0Bands[i + 1];
            const centerPercentage = (lowerBound + upperBound) / 2;

            // Only render if the label center is within the visible domain
            if (centerPercentage < xDomain[0] || centerPercentage > xDomain[1]) return;

            const sectorStartPx = this.xScale(Math.max(lowerBound, xDomain[0]));
            const sectorEndPx = this.xScale(Math.min(upperBound, xDomain[1]));
            const labelPosition = sectorStartPx + (sectorEndPx - sectorStartPx) / 2;
            // A band narrower than its own label (C1 spans 1–2 % of the axis) would
            // print over its neighbour; the threshold guide and the y-axis twin still
            // name it, and zooming in brings the label back.
            const labelWidth =
                this.measureTexts([ger], { fontWeight: 600 }).maxWidth +
                BAND_SWATCH.SIZE +
                BAND_SWATCH.GAP;
            if (sectorEndPx - sectorStartPx < labelWidth) return;

            this.#appendBandLabel(g, ger, {
                className: 'ger-label-x',
                x: labelPosition,
                y: this.chartSize + 55,
            });
        });

        // Y-axis (second domain) labels - each label centered within its band
        const d1Bands = [
            0,
            ...(d1Thresholds?.ksPercentageThresholds ?? []).map((t) => parseFloat(t)),
            100,
        ];
        (d1Thresholds?.ks ?? []).forEach((ger, i) => {
            const lowerBound = d1Bands[i];
            const upperBound = d1Bands[i + 1];
            const centerPercentage = (lowerBound + upperBound) / 2;

            // Only render if the label center is within the visible domain
            if (centerPercentage < yDomain[0] || centerPercentage > yDomain[1]) return;

            // Clip to visible domain and pixel-center within visible portion
            const sectorStartPx = this.yScale(Math.min(upperBound, yDomain[1]));
            const sectorEndPx = this.yScale(Math.max(lowerBound, yDomain[0]));
            const labelPosition = sectorStartPx + (sectorEndPx - sectorStartPx) / 2;
            // A band shorter than the label's glyphs (one font size; the measured
            // text box adds line leading the glyphs never fill) would print over its
            // neighbour; the threshold guide and the x-axis twin still name it, and
            // zooming in brings the label back.
            if (sectorEndPx - sectorStartPx < this.resolveChartTextSize('base')) return;

            this.#appendBandLabel(g, ger, {
                className: 'ger-label-y',
                x: -60,
                y: labelPosition,
                dy: '0.35em',
            });
        });
    }

    /**
     * One band label: the level name in secondary ink with the band's colour as a
     * small swatch beside it — the band is named, not shouted, and the colour is
     * carried by a mark rather than by the words.
     * @param {d3.Selection} g - The plot group.
     * @param {string} ger - The level name.
     * @param {{className: string, x: number, y: number, dy?: string | null}} spec - Class and the label's centre.
     */
    #appendBandLabel(g, ger, { className, x, y, dy = null }) {
        const colors = getThemeColors();
        const label = g
            .append('text')
            .attr('class', className)
            .attr('x', x)
            .attr('y', y)
            .style('text-anchor', 'middle')
            .style('fill', colors.chrome.textSecondary)
            .style('font-weight', 'var(--fw-semibold)')
            .text(ger)
            .call((sel) => this.stampGlossaryAttr(sel, getLevelGlossaryKey(ger)));
        if (dy) label.attr('dy', dy);

        const node = /** @type {SVGTextElement} */ (label.node());
        const textWidth = node?.getComputedTextLength?.() ?? 0;
        const box = node?.getBBox?.() ?? { y: y - BAND_SWATCH.SIZE / 2, height: BAND_SWATCH.SIZE };
        // The label shifts right by half the swatch so swatch + text stay centred.
        label.attr('x', x + (BAND_SWATCH.SIZE + BAND_SWATCH.GAP) / 2);
        g.append('rect')
            .attr('class', `${className}-swatch`)
            .attr('x', x - textWidth / 2 - (BAND_SWATCH.SIZE + BAND_SWATCH.GAP) / 2)
            .attr('y', box.y + (box.height - BAND_SWATCH.SIZE) / 2)
            .attr('width', BAND_SWATCH.SIZE)
            .attr('height', BAND_SWATCH.SIZE)
            .attr('rx', 2)
            .attr('fill', getCompetencyColor(ger));
    }

    /**
     * Apply force-based jitter to prevent overlapping points, caching the result so it
     * only recalculates when the data or the scales (zoom / chart size) change — keeping
     * jitter stable across re-renders. Compute + cache-key logic live in `scatterJitter.js`.
     * @param {Array} scatterplotData - Array of student data points
     * @returns {Array} Data with jittered x, y positions added
     */
    #applyJitterSimulation(scatterplotData) {
        const options = {
            xScale: this.xScale,
            yScale: this.yScale,
            jitter: CHART_CONFIG.JITTER,
            pointRadius: CHART_CONFIG.POINTS.RADIUS,
        };

        // Jitter disabled / no data: uncached, points sit at their scaled positions.
        if (!CHART_CONFIG.JITTER.ENABLED || scatterplotData.length === 0) {
            return simulateJitter(scatterplotData, options);
        }

        const cacheKey = buildJitterCacheKey(this.xScale, this.yScale, scatterplotData);
        if (isJitterCacheValid(this.#jitterCache, cacheKey)) {
            return this.#jitterCache.data ?? [];
        }

        const jitteredData = simulateJitter(scatterplotData, options);
        // Cache includes domains + ranges so a resize or zoom invalidates it.
        this.#jitterCache = { data: jitteredData, ...cacheKey };
        return jitteredData;
    }

    /**
     * Render student data points
     * @param {d3.Selection} g - The plot group the point cloud is appended to.
     * @param {Array} scatterplotData - Prepared student data points, before jitter.
     * @param {string} studentColor - Fill shared by every unselected point.
     */
    #renderStudentPoints(g, scatterplotData, studentColor) {
        // Apply jitter simulation to get non-overlapping positions
        const jitteredData = this.#applyJitterSimulation(scatterplotData);
        const self = this;
        const selectionConfig = CHART_CONFIG.SELECTION;

        const points = g
            .selectAll('.student-point')
            .data(jitteredData)
            .enter()
            .append('circle')
            .attr('class', 'student-point')
            .attr('cx', (d) => d.x)
            .attr('cy', (d) => d.y)
            .attr('r', CHART_CONFIG.POINTS.RADIUS)
            .style('fill', studentColor)
            .style('stroke', (d) =>
                this.enableSelection && this.#selection.isSelected(d.studentId)
                    ? selectionConfig.COLOR
                    : getThemeColors().chrome.chartStroke,
            )
            .style('stroke-width', (d) => {
                if (this.enableSelection && this.#selection.isSelected(d.studentId))
                    return `${selectionConfig.STROKE_WIDTH}px`;
                return '1px';
            })
            .style('opacity', (d) => {
                if (this.enableSelection) {
                    return this.#selection.isSelected(d.studentId)
                        ? 1
                        : selectionConfig.UNSELECTED_OPACITY;
                }
                return CHART_CONFIG.POINTS.OPACITY;
            });

        this.wireTooltipEvents(points, {
            getTooltipContent: (d) => self.formatTooltipContent(d, { type: 'student' }),
            tooltipId: SCATTERPLOT_TOOLTIP_ID,
            interactive: true,
            hoverEffect: {
                enter: {
                    r: CHART_CONFIG.POINTS.RADIUS_HOVER,
                    opacity: 1,
                },
                leave: {
                    r: CHART_CONFIG.POINTS.RADIUS,
                    opacity: (d) => {
                        if (self.enableSelection) {
                            return self.#selection.isSelected(d.studentId)
                                ? 1
                                : selectionConfig.UNSELECTED_OPACITY;
                        }
                        return CHART_CONFIG.POINTS.OPACITY;
                    },
                },
                useTransition: true,
                duration: 200,
            },
            onClick: (d, event, element) => {
                if (self.enableSelection) {
                    if (self.#selection.isRectangleSelecting) return;

                    event.stopPropagation();
                    self.#selection.toggle(d.studentId);
                    self.#selection.updatePointAppearance(d3.select(element), d);
                    return;
                }

                self.#onStudentClick?.({ studentId: d.studentId });
            },
        });

        // Add rectangle selection if selection mode is enabled
        if (this.enableSelection) {
            this.#selection.wireRectangleSelection(this.svg, g, points);
        }
    }

    // ========================================================================
    // SELECTION PUBLIC API (delegates to the ScatterSelectionController)
    // ========================================================================

    /**
     * Get currently selected student IDs
     * @public
     * @returns {Set} Set of selected student IDs
     */
    getSelectedIds() {
        return this.#selection.getSelectedIds();
    }

    /**
     * Set selected student IDs
     * @public
     * @param {Set|Array} ids - Student IDs to select
     */
    setSelectedIds(ids) {
        this.#selection.setSelectedIds(ids);
    }

    /**
     * Clear all selections
     * @public
     */
    clearSelection() {
        this.#selection.clearSelection();
    }

    /**
     * Arm or disarm touch marquee selection. Mouse drags are unaffected.
     * @public
     * @param {boolean} armed - Whether a touch drag should draw a marquee.
     */
    setTouchSelectionArmed(armed) {
        this.#selection.setTouchSelectionArmed(armed);
    }

    /**
     * Build legend item descriptors (shared between measurement and rendering)
     * @param {import('../../../../common/services/themeService.js').ThemeColors} theme - Resolved theme colours, source of each entry's swatch.
     * @returns {Array<object>} One descriptor per legend entry, in draw order.
     */
    #buildLegendItems(theme) {
        const [d0, d1] = this.enConfig.domainIds;
        const legendItems = [];

        legendItems.push({
            symbol: 'circle',
            className: 'legend-item',
            color: theme.chart.studentPoint,
            label: EN_TERMS.STUDENTS,
            opacity: 1,
            symbolSize: CHART_CONFIG.POINTS.RADIUS,
        });

        if (hasDrawableClassAverage(this, d0, d1)) {
            legendItems.push({
                symbol: CLASS_VISUAL.symbol,
                className: 'legend-item class-legend',
                color: theme.chart[CLASS_VISUAL.colorKey],
                label: this.classLabel ?? 'class',
                glossaryKey: CLASS_VISUAL.glossaryKey,
                opacity: this.visibilityState.class ? 1 : HIDDEN_LEGEND_OPACITY,
                symbolSize: CHART_CONFIG.AVERAGES.LEGEND_SIZE,
            });
        }

        // One entry per delivered comparison group — a group the payload omits gets no
        // legend entry, so an absent Landesschnitt reads as absent rather than as zero.
        for (const group of this.comparisons) {
            const visual = comparisonSeriesVisual(group);
            if (
                !Number.isFinite(group.domainAverages[d0]) ||
                !Number.isFinite(group.domainAverages[d1])
            )
                continue;

            // Several groups of one type share a symbol and a base colour, so the
            // ordinal is what ties a legend row to the tag on its marker. A lone
            // group has no `shortLabel` and reads exactly as it always did.
            legendItems.push({
                ...comparisonLegendEntry(group, theme),
                ...comparisonMarkerLegendPaint(group, theme),
                symbol: visual.symbol,
                className: 'legend-item comparison-legend',
                dataAttributes: { 'group-id': group.id },
                opacity: this.visibilityState[group.id] ? 1 : HIDDEN_LEGEND_OPACITY,
                symbolSize:
                    visual.symbol === 'square'
                        ? CHART_CONFIG.AVERAGES.LEGEND_SQUARE_SIZE
                        : CHART_CONFIG.AVERAGES.LEGEND_SIZE,
            });
        }

        return legendItems;
    }

    #buildLegendConfig(legendItems, availableWidth) {
        return {
            items: legendItems,
            layout: this.legend.resolveAdaptiveLegendLayout(legendItems, availableWidth, {
                defaultSymbolSize: CHART_CONFIG.AVERAGES.LEGEND_SIZE,
                symbolTextGap: LEGEND_SYMBOL_TEXT_GAP,
                columnGap: LEGEND_COLUMN_GAP,
            }),
        };
    }

    #createLegend(svg, legendConfig) {
        this.legend.createLegend({
            svg,
            ...legendConfig,
            legendIndex: 0,
        });
    }

    /**
     * Install header-action buttons before first render so the measured chart
     * body height is stable. Called by ChartHostModule before `create()`.
     * @override
     */
    installHeaderActions() {
        if (!this.#dataCoversAllCompetencyLevels(this.points)) {
            this.#createZoomButton();
        }
    }

    /**
     * Check whether every competency-level band is represented by at least one
     * data point on each axis independently. Returns true when zoom would offer
     * no benefit because the data already spans all levels.
     *
     * Student points and all explicitly passed averages are considered.
     * @param {Array} scatterplotData - Processed student data points
     * @returns {boolean} True when zooming would reveal nothing the full view does not already show.
     */
    #dataCoversAllCompetencyLevels(scatterplotData) {
        return dataCoversAllCompetencyLevels(scatterplotData, {
            thresholds: this.#getValidThresholds(),
            domainIds: this.enConfig.domainIds,
            classAverages: this.classAverages,
            comparisons: this.comparisons,
        });
    }

    /**
     * Create zoom toggle button in the module title bar
     */
    #createZoomButton() {
        const button = ensureHeaderActionButton(this.host, {
            selector: '[data-chart-action="zoom-toggle"]',
            buttonAttributes: {
                'data-chart-action': 'zoom-toggle',
            },
            ariaLabel: glossaryAnnotator.getRequiredEntryText(
                'general.buttons.element_texts.zoom.label',
            ),
            syncButton: (targetButton) => this.#syncZoomButton(targetButton),
            onClick: () => this.#toggleZoom(),
        });

        if (button) {
            this.#zoomButton = button;
        }
    }

    #syncZoomButton(button, isZoomed = this.chartState.zoom.isZoomed) {
        button.innerHTML = iconSvg('zoom_in');
        button.classList.toggle('is-active', isZoomed);
        button.setAttribute('aria-pressed', String(isZoomed));
    }

    /**
     * Toggle zoom state and update chart
     */
    #toggleZoom() {
        const renderParams = this.#renderParams;
        const data = this.#scatterplotData;
        if (!renderParams || !data) return;
        const { domain0Color, domain1Color } = renderParams;

        if (!this.chartState.zoom.isZoomed) {
            const zoomDomain = this.#calculateZoomDomain(data);
            this.xScale.domain([zoomDomain.xMin, zoomDomain.xMax]);
            this.yScale.domain([zoomDomain.yMin, zoomDomain.yMax]);
            this.#updateForZoom(this.g, data, true, domain0Color, domain1Color);
            this.chartState.zoom.isZoomed = true;
        } else {
            this.xScale.domain(this.chartState.zoom.originalXDomain);
            this.yScale.domain(this.chartState.zoom.originalYDomain);
            this.#updateForZoom(this.g, data, false, domain0Color, domain1Color);
            this.chartState.zoom.isZoomed = false;
        }

        this.#updateZoomButtonState(this.chartState.zoom.isZoomed);
    }

    /**
     * Update zoom button visual state
     * @param {boolean} isZoomed - The state the button should now advertise.
     */
    #updateZoomButtonState(isZoomed) {
        const btn =
            this.#zoomButton ||
            this.host?.headerActionsContainer?.querySelector('[data-chart-action="zoom-toggle"]');
        if (!btn) return;
        this.#syncZoomButton(btn, isZoomed);
    }

    /**
     * Calculate zoom domain bounds based on data
     * @param {Array} scatterplotData - The scatterplot data
     * @returns {object} Object with xMin, xMax, yMin, yMax
     */
    #calculateZoomDomain(scatterplotData) {
        return calculateZoomDomain(scatterplotData, {
            domainIds: this.enConfig.domainIds,
            classAverages: this.classAverages,
            comparisons: this.comparisons.filter((g) => g.type === 'state'),
            padding: CHART_CONFIG.ZOOM.PADDING,
        });
    }

    /**
     * Update chart elements for zoom
     * @param {d3.Selection} g - The plot group holding the points, markers and axes.
     * @param {Array} scatterplotData - Prepared student data points; re-jittered against the new scales.
     * @param {boolean} _isZooming - Zoom direction, unused: both directions animate the same way.
     * @param {string} domain0Color - Accent for the x-axis thresholds.
     * @param {string} domain1Color - Accent for the y-axis thresholds.
     */
    #updateForZoom(g, scatterplotData, _isZooming, domain0Color, domain1Color) {
        const duration = motionDuration(CHART_CONFIG.ZOOM.TRANSITION_DURATION);

        // Update axes with transitions instead of removing/recreating
        this.#updateAxesWithTransition(g, domain0Color, domain1Color, duration);

        // Recalculate jittered positions with new scale
        const jitteredData = this.#applyJitterSimulation(scatterplotData);

        // Update student points with new jittered positions
        g.selectAll('.student-point')
            .data(jitteredData)
            .transition()
            .duration(duration)
            .attr('cx', (d) => d.x)
            .attr('cy', (d) => d.y);

        // Update average points (first domain → x, second domain → y, matching initial render)
        const squareSize = CHART_CONFIG.AVERAGES.SQUARE_SIZE;
        const markerSize = CHART_CONFIG.AVERAGES.SIZE;
        const [d0, d1] = this.enConfig.domainIds;

        const classPoint = g.select('.class-average-point');
        if (!classPoint.empty() && hasDrawableClassAverage(this, d0, d1)) {
            const trianglePath = getTrianglePath(
                this.xScale(this.classAverages[d0]),
                this.yScale(this.classAverages[d1]),
                markerSize,
            );
            classPoint.transition().duration(duration).attr('d', trianglePath);
        }

        for (const group of this.comparisons) {
            const escaped = CSS.escape(group.id);
            const marker = g.select(`.comparison-average-point[data-group-id="${escaped}"]`);
            if (marker.empty()) continue;

            const x = this.xScale(group.domainAverages[d0]);
            const y = this.yScale(group.domainAverages[d1]);
            const symbol = comparisonSeriesVisual(group).symbol;
            if (symbol === 'square') {
                marker
                    .transition()
                    .duration(duration)
                    .attr('x', x - squareSize / 2)
                    .attr('y', y - squareSize / 2);
            } else {
                marker
                    .transition()
                    .duration(duration)
                    .attr('d', markerPath(this, symbol, x, y));
            }

            // The centre dot and the ordinal tag move with their marker: left behind at
            // the pre-zoom coordinates they would sit next to a different group's mark.
            g.select(`.comparison-average-dot[data-group-id="${escaped}"]`)
                .transition()
                .duration(duration)
                .attr('cx', x)
                .attr('cy', y);
            const tag = g.select(`.comparison-average-tag[data-group-id="${escaped}"]`);
            if (!tag.empty()) {
                const tagPosition = averageMarkerTagPosition(this, x, y, symbol);
                tag.transition()
                    .duration(duration)
                    .attr('x', tagPosition.x)
                    .attr('y', tagPosition.y);
            }
        }

        // Update GER labels (fade out old, fade in new)
        // Use a guard to ensure labels are re-rendered exactly once after all fade-out transitions complete
        let labelsUpdated = false;
        g.selectAll('.ger-label-x, .ger-label-y, .ger-label-x-swatch, .ger-label-y-swatch')
            .transition()
            .duration(duration)
            .style('opacity', 0)
            .on('end', () => {
                if (labelsUpdated) return;
                labelsUpdated = true;
                g.selectAll(
                    '.ger-label-x, .ger-label-y, .ger-label-x-swatch, .ger-label-y-swatch',
                ).remove();
                this.#addCompetencyLabels(g);
                g.selectAll('.ger-label-x, .ger-label-y, .ger-label-x-swatch, .ger-label-y-swatch')
                    .style('opacity', 0)
                    .transition()
                    .duration(motionDuration(200))
                    .style('opacity', 1);
            });
    }

    /**
     * Update axes with transition animation
     * @param {d3.Selection} g - The plot group holding both axis groups.
     * @param {string} domain0Color - Accent for the x-axis thresholds.
     * @param {string} domain1Color - Accent for the y-axis thresholds.
     * @param {number} duration - Transition length in ms.
     */
    #updateAxesWithTransition(g, domain0Color, domain1Color, duration) {
        const { x: xThresholds, y: yThresholds } = this.#getValidThresholds();
        const chartSize = this.chartSize;

        // Update X-axis
        const xAxisGroup = g.select('.x-axis');
        xAxisGroup
            .transition()
            .duration(duration)
            .call(
                createPercentAxis('bottom', this.xScale, {
                    tickValues: this.#computeAllTicks(this.xScale, xThresholds),
                }),
            );
        this.normalizeSvgTypography(xAxisGroup);
        this.#styleThresholdAxis(xAxisGroup, {
            axis: 'x',
            thresholds: xThresholds,
            accentColor: domain0Color,
            chartSize,
            duration,
        });

        // Update Y-axis
        const yAxisGroup = g.select('.y-axis');
        yAxisGroup
            .transition()
            .duration(duration)
            .call(
                createPercentAxis('left', this.yScale, {
                    tickValues: this.#computeAllTicks(this.yScale, yThresholds),
                }),
            );
        this.normalizeSvgTypography(yAxisGroup);
        this.#styleThresholdAxis(yAxisGroup, {
            axis: 'y',
            thresholds: yThresholds,
            accentColor: domain1Color,
            chartSize,
            duration,
        });
    }

    // Note: Tooltip cleanup is automatic via chartState.tooltipIds tracking
    // Zoom state and scales in chartState are also auto-cleaned

    destroy() {
        if (this.#zoomButton) {
            this.#zoomButton.remove();
            this.#zoomButton = null;
        }
        super.destroy();
    }
}
