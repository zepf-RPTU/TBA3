/**
 * D3.js Lollipop Chart for Mathematics Item Success Rates
 * Extends ChartRenderer for consistent chart behavior and responsive design
 */

import { LollipopChartRenderer } from '../../../../common/charts/renderers/lollipopChartRenderer.js';
import { compareLevelLabels, getItemLevelColor } from '../../../../common/domain/levels.js';
import {
    getDiamondPath,
    getTrianglePath,
    getCrossPath,
} from '../../../../common/charts/markerSymbols.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    getResponsiveTickCount,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { MA_TERM_CONSTANTS } from '../../../maTerms.js';
import { markerPaintForIndex } from '../../../../common/charts/comparisonSeries.js';
import { appendMarkerDot } from '../../../../common/charts/markerSymbols.js';
import * as d3 from 'd3';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CHART_CONFIG = {
    // Visual styling
    DOMAIN_SEPARATOR_DASHARRAY: '5,5',
    DOMAIN_SEPARATOR_OPACITY: 0.7,

    // Layout spacing
    DOMAIN_LABEL_TOP_GAP: 8,
    DOMAIN_LABEL_ROW_GAP: 6,
    DOMAIN_LABEL_BOTTOM_PADDING: 4,

    // Colors
    get DOMAIN_SEPARATOR_COLOR() {
        return getThemeColors().chrome.textDisabled;
    },
};

/**
 * Path generators for the `path`-based average markers. `square` is absent on
 * purpose — it is drawn as a `rect`.
 */
const MARKER_PATH_BY_SHAPE = Object.freeze({
    diamond: getDiamondPath,
    triangle: getTrianglePath,
    cross: getCrossPath,
});

// ============================================================================
// ITEM SUCCESS LOLLIPOP CHART CLASS
// ============================================================================

/**
 * Lollipop chart showing item success rates by item level
 * @augments LollipopChartRenderer
 */
export class ItemSuccessLollipopChart extends LollipopChartRenderer {
    /**
     * Answers "is this average drawn?" — the host's config state owns the answer, so
     * it is asked at draw time rather than copied into the registry.
     * @type {(id: string) => boolean}
     */
    #isAverageVisible;

    constructor(containerId, itemArray, options = {}) {
        const { isAverageVisible = () => false, ...rendererOptions } = options;
        super(containerId, {
            defaultWidth: 800,
            defaultHeight: 500,
            animationDuration: 200,
            layout: chartLayoutPreset('rightLegend', {
                legends: [{ position: 'right', gap: 15 }],
                padding: { top: 15 },
            }),
            ...rendererOptions,
        });

        this.#isAverageVisible = isAverageVisible;

        // Store all cleanable state in chartState for automatic cleanup
        this.chartState.items = itemArray;
        // Averages: map of { id → { cache, label, color, typeIndex, shape, generator } }
        this.chartState.averages = new Map();
    }

    // ============================================================================
    // LIFECYCLE METHODS (Abstract implementations)
    // ============================================================================

    validateData() {
        const items = this.getCurrentlyDisplayedItems();
        return !!items?.length;
    }

    /**
     * Register an average type that can be toggled on/off.
     * @param {string} id - Unique identifier (e.g., 'landesschnitt')
     * @param {object} config - How this average draws and where its values come from.
     * @param {string} config.name - The population's bare name, for the ⌀ dropdown
     * @param {string} config.label - Display label for the tooltip (ordinal-tagged when the payload needs disambiguating)
     * @param {string} config.color - Theme color key (under `chart`) or CSS color
     * @param {'diamond'|'square'|'triangle'} [config.shape='diamond'] - Marker shape
     * @param {number} [config.typeIndex=0] - Position among the groups sharing this
     *   type; indexes the shade ramp so several Landesschnitte differ on the mark
     * @param {Function} config.generator - (data) => averageDataArray
     */
    registerAverage(id, config) {
        this.chartState.averages.set(id, {
            cache: null,
            name: config.name,
            label: config.label,
            color: config.color,
            typeIndex: config.typeIndex ?? 0,
            shape: config.shape || 'diamond',
            generator: config.generator,
        });
    }

    /**
     * Whether an average is drawn, as the host's config state currently answers it.
     * @param {string} id - The average's id.
     * @returns {boolean} True when it should be drawn.
     */
    isAverageVisible(id) {
        return this.#isAverageVisible(id);
    }

    /**
     * Get data for a specific average type (with caching).
     * @param {string} id - The average's id.
     * @param {Array<object>} data - The items currently drawn, which the generator maps onto.
     * @returns {Array<object>} One entry per item the average has a value for; empty for an unregistered id.
     */
    getAverageData(id, data) {
        const avg = this.chartState.averages.get(id);
        if (!avg) return [];
        if (!avg.cache) {
            avg.cache = avg.generator(data);
        }
        return avg.cache;
    }

    // ============================================================================
    // TOOLTIP CONTENT
    // ============================================================================

    /**
     * Format tooltip content for a lollipop data point
     * @override
     * @param {object} segment - The data point
     * @param {object} context - Additional context (e.g., type: 'landesschnitt')
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        if (context.averageLabel) {
            return this.buildTooltipHTML({
                title: context.averageLabel,
                rows: [
                    { label: TERM_CONSTANTS.ITEM, value: segment.name },
                    { label: 'Lösungsrate', value: `${segment.percentage.toFixed(1)}%` },
                ],
            });
        }

        return this.buildTooltipHTML({
            title: segment.exerciseName,
            rows: [
                { label: TERM_CONSTANTS.ITEM, value: segment.name },
                { label: MA_TERM_CONSTANTS.DOMAIN, value: segment.domain },
                { label: TERM_CONSTANTS.ITEM_LEVEL, value: segment.competenceLevel },
                { label: 'Lösungsrate', value: `${segment.percentage.toFixed(1)}%` },
            ],
        });
    }

    async renderChart() {
        const currentItems = this.getCurrentlyDisplayedItems();

        if (!currentItems || currentItems.length === 0) {
            this.showNoDataMessage();
            return;
        }

        // Prepare data early (needed for legend measurement)
        const data = this.prepareChartData(currentItems);
        const domains = [...new Set(data.map((d) => d.domain))].sort();
        const itemLevelColors = this.#getItemLevelColors(data);

        // Measure axis space
        const axisLeftSpace = measurePercentAxisSpace(this, 'left', {
            axisTitleText: 'Lösungsrate (%)',
        });

        const domainLabelLayout = this.#buildDomainLabelLayout(domains);

        // Build legend config for measurement
        // Item-scale order, not alphabetical — `Ia < Ib < II`, not `II < Ia`.
        const ksLevels = [...new Set(data.map((d) => d.competenceLevel))].sort(compareLevelLabels);
        const legendConfig = {
            items: ksLevels.map((level) => ({
                label: `${TERM_CONSTANTS.ITEM_LEVEL} ${level}`,
                color: this.#getKSLevelColor(level),
                symbol: 'lollipop',
            })),
            layout: { direction: 'vertical' },
        };

        const { svg, g, dimensions, layout } = this.initializeSVG({
            axisOverrides: {
                left: axisLeftSpace,
                bottom: domainLabelLayout.reserve,
            },
            legendConfigs: [legendConfig],
        });

        this.svg = svg;
        this.mainGroup = g;

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        // Add diamond size for Landesschnitt
        dimensions.elements.diamondSize = Math.max(4, Math.min(8, dimensions.geometryScale * 0.4));

        // Create constrained position scale (domain-aware, fills full chart width)
        const positionFn = this.#createDomainAwarePositionScale(data, domains, chartWidth);

        const yScale = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);

        // Create chart components
        this.createAxes(g, yScale, dimensions);
        this.createLollipopElements(
            g,
            data,
            positionFn,
            yScale,
            chartHeight,
            itemLevelColors,
            dimensions,
        );

        // Render all visible averages as diamond markers
        for (const [id, avg] of this.chartState.averages) {
            if (this.isAverageVisible(id)) {
                this.createAverageElements(g, id, avg, data, positionFn, yScale, dimensions);
            }
        }
        // Stacking: comparison markers sit behind the class heads.
        g.selectAll('.lollipop-circle').raise();

        this.createDomainSeparatorsAndLabels(
            g,
            data,
            positionFn,
            chartHeight,
            domains,
            dimensions,
            domainLabelLayout,
        );
        this.legend.createLegend({
            svg,
            items: legendConfig.items,
            legendIndex: 0,
            layout: {
                direction: 'vertical',
                verticalCenter: true,
            },
            cssClass: 'legend legend-right',
        });
        this.addChartStyles(svg);
    }

    // ============================================================================
    // DATA MANAGEMENT
    // ============================================================================

    getCurrentlyDisplayedItems() {
        return this.chartState.items;
    }

    prepareChartData(currentItems) {
        return currentItems
            .map((item) => {
                return {
                    iqbId: item.iqbId,
                    name: item.name,
                    exerciseName: item.exerciseName,
                    domain: item.domainLabel,
                    // The payload mean, like the comparison means it sits beside — not
                    // the result-count share the item table's bar draws.
                    percentage: item.meanPercentage,
                    competenceLevel: item.competenceLevel,
                    isLandesschnitt: false,
                };
            })
            .sort((a, b) => {
                const domainCompare = a.domain.localeCompare(b.domain);
                if (domainCompare !== 0) return domainCompare;
                return a.name.localeCompare(b.name);
            });
    }

    // ============================================================================
    // CHART COMPONENTS
    // ============================================================================

    createAxes(g, yScale, dimensions) {
        const tickCount = getResponsiveTickCount(dimensions, { compactHeight: 300 });

        // X axis baseline only (no ticks — items use constrained positions)
        g.append('line')
            .attr('class', 'x-axis-baseline')
            .attr('x1', 0)
            .attr('x2', dimensions.chartWidth)
            .attr('y1', dimensions.chartHeight)
            .attr('y2', dimensions.chartHeight)
            .attr('stroke', 'currentColor');

        // Y axis
        g.append('g')
            .attr('class', 'y-axis')
            .call(createPercentAxis('left', yScale, { ticks: tickCount }));

        // Y axis label
        this.renderAxisTitle(g, 'left', 'Lösungsrate (%)', {
            fontWeight: 'bold',
            className: 'axis-label',
        });

        // Grid lines
        this.grid.createGridLines(g, {
            yScale,
            chartWidth: dimensions.chartWidth,
        });
    }

    createLollipopElements(g, data, positionFn, yScale, chartHeight, itemLevelColors, dimensions) {
        const { elements } = dimensions;
        const stemWidth = Math.max(1.5, elements.lineStrokeWidth * 1.15);
        const headRadius = elements.circleRadius * 1.15;

        const { lines, circles } = this.createStandardLollipops(g, data, {
            x: (d) => positionFn(d),
            y: (d) => yScale(d.percentage),
            baselineY: chartHeight,
            stemColor: (d) => itemLevelColors[d.competenceLevel],
            headColor: (d) => itemLevelColors[d.competenceLevel],
            stemWidth,
            headRadius,
        });

        // Wire coordinated hover for stem+head pairs (auto-defaults + darken)
        this.wireLollipopPairEvents(lines, circles, {
            getTooltipContent: (d) => this.formatTooltipContent(d),
            tooltipId: 'item-success-lollipop',
            getKey: 'name',
            darkenHead: 0.3,
        });
    }

    createAverageElements(g, id, avg, data, positionFn, yScale, dimensions) {
        const averageData = this.getAverageData(id, data);
        const { elements } = dimensions;
        const colors = getThemeColors();
        // Theme colour keys live under `chart` (`school`, `state`). Reading them off
        // the root returned undefined and fell through to the key itself, so every
        // marker was painted with the invalid fill `"school"`/`"state"` — which the
        // browser renders as black, collapsing the school/state distinction too.
        const baseColor = colors.chart[avg.color] ?? avg.color;
        // Several groups of one type share a shape and a base colour; this chart has
        // no legend, so the mark itself must say which: the first is filled, every
        // further one hollow, with the shade as the secondary cue.
        const paint = markerPaintForIndex(baseColor, avg.typeIndex, colors);
        const shape = avg.shape || 'diamond';
        const markerClass = `average-marker average-marker-${id}`;
        const size = elements.diamondSize;

        let markers;
        if (shape === 'square') {
            markers = g
                .selectAll(`.average-marker-${id}`)
                .data(averageData)
                .enter()
                .append('rect')
                .attr('class', markerClass)
                .attr('x', (d) => positionFn(d) - size)
                .attr('y', (d) => yScale(d.percentage) - size)
                .attr('width', size * 2)
                .attr('height', size * 2);
        } else {
            // diamond (default), triangle or cross
            const pathFn = MARKER_PATH_BY_SHAPE[shape] ?? getDiamondPath;

            markers = g
                .selectAll(`.average-marker-${id}`)
                .data(averageData)
                .enter()
                .append('path')
                .attr('class', markerClass)
                .attr('d', (d) => pathFn(positionFn(d), yScale(d.percentage), size));
        }

        markers
            .attr('fill', paint.fill)
            .attr('stroke', paint.hollow ? paint.stroke : colors.chrome.chartStroke)
            .attr('stroke-width', paint.hollow ? paint.strokeWidth : 1.5);

        const dotFill = paint.dotFill;
        if (dotFill) {
            averageData.forEach((d) => {
                appendMarkerDot(g, {
                    cx: positionFn(d),
                    cy: yScale(d.percentage),
                    size,
                    fill: dotFill,
                    className: `average-marker-dot average-marker-dot-${id}`,
                });
            });
        }

        // Wire tooltip events for markers
        this.wireTooltipEvents(markers, {
            getTooltipContent: (d) => this.formatTooltipContent(d, { averageLabel: avg.label }),
            tooltipId: 'item-success-lollipop',
            hoverEffect: {
                enter: { fill: colors.chrome.textSecondary },
                leave: { fill: paint.fill },
            },
        });
    }

    createDomainSeparatorsAndLabels(
        g,
        data,
        positionFn,
        chartHeight,
        domains,
        dimensions,
        domainLabelLayout,
    ) {
        if (domains.length <= 1 || domainLabelLayout.rowCount === 0) return;

        // Group data by domain
        const domainGroups = {};
        data.forEach((item) => {
            if (!domainGroups[item.domain]) {
                domainGroups[item.domain] = [];
            }
            domainGroups[item.domain].push(item);
        });

        // Compute per-domain position ranges and inter-domain separator midpoints
        const domainCenters = [];
        const domainBoundaries = [];
        let prevDomainLastX = null;

        domains.forEach((domain) => {
            const domainItems = domainGroups[domain];
            if (!domainItems || domainItems.length === 0) return;

            const xPositions = domainItems.map((item) => positionFn(item));
            const minX = Math.min(...xPositions);
            const maxX = Math.max(...xPositions);

            domainCenters.push({
                domain,
                centerX: (minX + maxX) / 2,
            });

            // Separator at midpoint between last item of prev domain and first item of this domain
            if (prevDomainLastX !== null) {
                domainBoundaries.push((prevDomainLastX + minX) / 2);
            }
            prevDomainLastX = maxX;
        });

        // Draw separators
        g.selectAll('.domain-separator')
            .data(domainBoundaries)
            .enter()
            .append('line')
            .attr('class', 'domain-separator')
            .attr('x1', (d) => d)
            .attr('x2', (d) => d)
            .attr('y1', 0)
            .attr('y2', chartHeight)
            .attr('stroke', CHART_CONFIG.DOMAIN_SEPARATOR_COLOR)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', CHART_CONFIG.DOMAIN_SEPARATOR_DASHARRAY)
            .attr('opacity', CHART_CONFIG.DOMAIN_SEPARATOR_OPACITY);

        // Add domain labels centered under each domain group, clamped to chart bounds
        const rowStep = domainLabelLayout.labelHeight + domainLabelLayout.rowGap;
        const chartWidth = dimensions.chartWidth;

        g.selectAll('.domain-label')
            .data(domainLabelLayout.labels)
            .enter()
            .append('text')
            .attr('class', 'domain-label')
            .attr('x', 0)
            .attr('y', (d) => chartHeight + domainLabelLayout.topGap + d.rowIndex * rowStep)
            .attr('dominant-baseline', 'hanging')
            .attr('font-weight', 'bold')
            .attr('fill', getThemeColors().chrome.textSecondary)
            .text((d) => d.label)
            .each(function (d) {
                const centerData = domainCenters.find((dc) => dc.domain === d.domain);
                const centerX = centerData ? centerData.centerX : 0;
                const bbox = this.getBBox();
                const halfW = bbox.width / 2;

                // Clamp so the label stays within [0, chartWidth]
                const clampedX = Math.max(halfW, Math.min(chartWidth - halfW, centerX));
                d3.select(this).attr('x', clampedX).attr('text-anchor', 'middle');
            });
    }

    addChartStyles(svg) {
        const styleElement = svg.append('defs').append('style');
        styleElement.text(`
            .lollipop-circle {
                transition: r 200ms ease, fill 200ms ease;
            }
            .lollipop-line {
                transition: stroke-width 200ms ease;
            }
            .domain-separator {
                opacity: 0.7;
            }
            .domain-label {
                transition: fill 200ms ease;
            }
        `);
    }

    /**
     * Build an iqbId→x-position lookup covering the full chart width.
     * Intra-domain item spacing is uniform; domain gaps and edge padding
     * are each 2× the intra-domain spacing.
     * @param {Array} data - Sorted chart data array
     * @param {Array} domains - Sorted unique domain names
     * @param {number} chartWidth - Available chart width
     * @returns {Function} (d) => x position for a data point
     */
    #createDomainAwarePositionScale(data, domains, chartWidth) {
        // Group data by domain (preserving sort order within each domain)
        const domainGroups = new Map();
        for (const domain of domains) {
            domainGroups.set(domain, []);
        }
        for (const item of data) {
            domainGroups.get(item.domain)?.push(item);
        }

        // Count intra-domain gaps and inter-domain gaps
        const totalDomainGaps = Math.max(0, domains.length - 1);
        let intraDomainGaps = 0;
        for (const items of domainGroups.values()) {
            intraDomainGaps += Math.max(0, items.length - 1);
        }

        // Edge padding and domain gaps each count as 2× an intra-domain gap.
        // 2 edges (left + right) + inter-domain gaps + intra-domain gaps.
        const effectiveSlots = intraDomainGaps + totalDomainGaps * 2 + 2 * 2;
        const spacing = effectiveSlots > 0 ? chartWidth / effectiveSlots : 0;
        const edgePadding = spacing * 2;
        const domainGap = spacing * 2;

        // Assign positions sequentially: items within domain, then gap, then next domain
        const positionMap = new Map();
        let currentX = edgePadding;

        for (const [domainIndex, domain] of domains.entries()) {
            const items = domainGroups.get(domain) || [];
            for (let i = 0; i < items.length; i++) {
                positionMap.set(items[i].iqbId, currentX);
                if (i < items.length - 1) {
                    currentX += spacing;
                }
            }
            // Add domain gap after each domain (except the last)
            if (domainIndex < domains.length - 1 && items.length > 0) {
                currentX += domainGap;
            }
        }

        // Return lookup function
        return (d) => positionMap.get(d.iqbId) ?? 0;
    }

    /**
     * Item levels are on the Aufgabenniveau scale the payload registered, which shares no
     * vocabulary with most states' reporting scales; `getItemLevelColor` bridges the two.
     * @param {string} ksLevel - The item's Aufgabenniveau.
     * @returns {string} Its colour, falling back to the brand colour for a level the scale does not know.
     */
    #getKSLevelColor(ksLevel) {
        return getItemLevelColor(ksLevel) ?? getThemeColors().chrome.primaryBrand;
    }

    #getItemLevelColors(data) {
        const uniqueItemLevels = [...new Set(data.map((d) => d.competenceLevel))];
        const colors = {};
        for (const itemLevel of uniqueItemLevels) {
            colors[itemLevel] = this.#getKSLevelColor(itemLevel);
        }
        return colors;
    }

    #buildDomainLabelLayout(domains) {
        if (!Array.isArray(domains) || domains.length <= 1) {
            return {
                labels: [],
                rowCount: 0,
                labelHeight: 0,
                topGap: 0,
                rowGap: 0,
                reserve: 0,
            };
        }

        const labels = domains.map((domain, index) => ({
            domain,
            label: domain,
            rowIndex: index % 2,
        }));

        const measured = this.measureTexts(
            labels.map(({ label }) => label),
            {
                fontFamily: this.getChartFont(),
                fontWeight: 'bold',
            },
        );

        const rowCount = Math.min(2, labels.length);
        const labelHeight = Math.max(this.getChartTextMeasureSize(), Math.ceil(measured.maxHeight));
        const topGap = CHART_CONFIG.DOMAIN_LABEL_TOP_GAP;
        const rowGap = rowCount > 1 ? CHART_CONFIG.DOMAIN_LABEL_ROW_GAP : 0;
        const reserve =
            topGap +
            rowCount * labelHeight +
            (rowCount - 1) * rowGap +
            CHART_CONFIG.DOMAIN_LABEL_BOTTOM_PADDING;

        return {
            labels,
            rowCount,
            labelHeight,
            topGap,
            rowGap,
            reserve,
        };
    }
}
