/**
 * Self-Efficacy Stacked Bar — the Selbstwirksamkeit rating distribution per class,
 * horizontal with an HTML legend panel, vertical for a single class, or compact.
 */

import {
    BarChartRenderer,
    createSVGStackedBar,
} from '../../../../common/charts/renderers/barChartRenderer.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { motionDuration } from '../../../../common/charts/motionPreference.js';
import {
    chartLayoutPreset,
    createPercentAxis,
    measureCategoryAxisSpace,
    measurePercentEdgeTickReserve,
    measurePercentAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { appendHtmlLegendSwatchSection } from '../../../../common/charts/legend/htmlLegendPanel.js';
import {
    RATING_CATEGORIES,
    buildRatingSegments,
    formatRatingCategoryLabel,
    getRatingCategoryDescription,
} from '../../../utils/slRatingDistribution.js';
import * as d3 from 'd3';

const VERTICAL_STACKED_BAR_LABEL_Y = 25;
const VERTICAL_STACKED_BAR_LABEL_BOTTOM_BUFFER = 4;

/**
 * Get student means from data.
 * @param {object} classData - Class data with a values array of per-student sp_mean values
 * @returns {Array|null} Array of student means or null
 */
function getStudentMeans(classData) {
    return classData.values?.length > 0 ? classData.values : null;
}

/**
 * Self-Efficacy Stacked Bar Chart Class
 *
 * When a legendContainer is provided (via selfEfficacyConfig in horizontal mode),
 * renders an interactive HTML legend panel with row toggle pills and rating swatches.
 * Horizontal non-compact charts without a legendContainer fall back to an SVG
 * legend above the chart; vertical and compact modes intentionally suppress it.
 *
 * Compact mode (`options.compact === true`) keeps only the stacked-bar geometry
 * for decorative thumbnail previews and suppresses axes, legends, labels, and
 * tooltip wiring.
 */
export class SelfEfficacyStackedBar extends BarChartRenderer {
    constructor(containerId, data, options = {}) {
        const defaultHeight = options.height ?? 300;
        const isVertical = options.isVertical ?? false;
        const compact = options.compact === true;
        const hasHtmlLegend = !!options.legendContainer && !compact;

        super(containerId, {
            defaultWidth: isVertical ? 180 : 800,
            defaultHeight,
            autoResize: true,
            ...options,
            layout: chartLayoutPreset(compact ? 'compactNoAxis' : 'paddedNoLegend', {
                legends:
                    isVertical || hasHtmlLegend || compact ? [] : [{ position: 'top', gap: 8 }],
            }),
        });

        this.data = data;
        this.compact = compact;
        this.config = {
            height: defaultHeight,
            showLabels: options.showLabels !== false,
            isVertical: isVertical,
            ...options,
        };
        // Store cache in chartState for automatic cleanup
        this.chartState.cache = {
            validData: null,
            tooltip: null,
        };
    }

    validateData() {
        return this.getValidData().length > 0;
    }
    /** @override */
    destroy() {
        this._spLayout = null;
        super.destroy();
    }

    /**
     * Format tooltip content for stacked bar segments
     * @param {object} segment - Segment data with label, value, percentage, etc.
     * @param {object} context - Context (unused, for interface compatibility)
     * @returns {string} HTML content for tooltip
     */
    // eslint-disable-next-line no-unused-vars
    formatTooltipContent(segment, context = {}) {
        const rows = [
            { label: 'Bewertung', value: segment.label },
            { label: 'Anzahl', value: `${segment.value} von ${segment.total}` },
            { label: 'Anteil', value: `${segment.percentage.toFixed(1)}%` },
        ];

        let footer = null;
        if (segment.mean) {
            footer = `Mittelwert: <strong>${segment.mean.toFixed(2)}</strong>`;
        }

        const title = this.config.isVertical
            ? getRatingCategoryDescription(segment.key) || segment.label
            : segment.className;

        return this.buildTooltipHTML({
            title,
            rows,
            footer,
        });
    }

    /**
     * Cache and return data entries with valid .statistics or .count > 0.
     * @returns {Array<object>} The entries that have something to draw.
     */
    getValidData() {
        if (!this.chartState.cache.validData) {
            this.chartState.cache.validData = (
                Array.isArray(this.data) ? this.data : [this.data]
            ).filter((d) => d?.statistics || d?.count > 0);
        }
        return this.chartState.cache.validData;
    }

    setData(data) {
        this.data = data;
        this.chartState.cache.validData = null;
    }

    /** Build SVG with vertical or horizontal stacked bars from rating distribution data. */
    renderChart() {
        this.clearContainer();
        this._spLayout = null;
        const allValidData = this.getValidData();
        const themeColors = getThemeColors();
        if (allValidData.length === 0) {
            this.showNoDataMessage();
            return;
        }

        const { isVertical } = this.config;
        const hasHtmlLegend = !!this.options.legendContainer && !this.compact;

        // The legend panel is separate from the SVG area, so it renders first: its
        // state (kept across re-renders) decides which rows are drawn.
        if (!isVertical && hasHtmlLegend) {
            this.htmlLegend.render(this.#legendSections(allValidData), () =>
                this.#updateChartVisibility(),
            );
        } else {
            this.htmlLegend.reset();
        }

        // Filter to visible rows only (horizontal mode with HTML legend)
        const validData =
            !isVertical && hasHtmlLegend
                ? allValidData.filter((d) =>
                      this.htmlLegend.isVisible('row', d.className || 'Schule'),
                  )
                : allValidData;

        if (!isVertical && hasHtmlLegend && validData.length === 0) {
            this.showNoDataMessage();
            return;
        }

        // Build legend items for horizontal orientation (SVG legend only when no HTML panel)
        const legendItems =
            !this.compact && !isVertical && !hasHtmlLegend ? this.#buildLegendItems() : [];

        // Measure axes
        let axisOverrides;
        if (this.compact) {
            axisOverrides = { top: 0, right: 0, bottom: 0, left: 0 };
        } else if (isVertical) {
            this.calculateDimensions();
            const leftAxis = measurePercentAxisSpace(this, 'left', { step: 20 });
            const primaryLabel = allValidData[0]?.className || 'Schule';
            const labelMeasured = this.measureTexts([primaryLabel], {
                fontFamily: this.getChartFont(),
                fontWeight: 'var(--fw-semibold)',
            });
            const bottomAxis =
                VERTICAL_STACKED_BAR_LABEL_Y +
                Math.ceil(labelMeasured.maxHeight) +
                VERTICAL_STACKED_BAR_LABEL_BOTTOM_BUFFER;
            axisOverrides = { left: leftAxis, bottom: bottomAxis };
        } else {
            const bottomAxis = measurePercentAxisSpace(this, 'bottom', {
                step: 20,
                axisTitleText: `Anteil ${TERM_CONSTANTS.STUDENTS}`,
            });
            const leftAxis = measureCategoryAxisSpace(
                this,
                'left',
                allValidData.map((d) => d.className || 'Schule'),
            );
            // Reserve right margin so the last x-axis tick label ("100%") is not clipped
            const rightAxis = measurePercentEdgeTickReserve(this, { buffer: 0 });
            axisOverrides = { left: leftAxis, bottom: bottomAxis, right: rightAxis };
        }

        const legendAvailableWidth = this.legend.getAvailableLegendSlotWidth({
            left: axisOverrides.left ?? 0,
            right: axisOverrides.right ?? 0,
        });
        const legendConfig =
            legendItems.length > 0
                ? {
                      items: legendItems,
                      symbolSize: 14,
                      layout: this.legend.resolveAdaptiveLegendLayout(
                          legendItems,
                          legendAvailableWidth,
                          {
                              defaultSymbolSize: 14,
                              symbolTextGap: 20,
                          },
                      ),
                  }
                : null;

        const { svg, g, layout } = this.initializeSVG({
            axisOverrides,
            legendConfigs: legendConfig ? [legendConfig] : [],
        });

        const chartWidth = layout.chart.width;
        const chartHeight = layout.chart.height;

        if (isVertical) {
            // Vertical orientation: single stacked bar from bottom to top
            const yScale = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);

            if (!this.compact) {
                // Y-axis with percentage labels
                g.append('g').attr('class', 'y-axis').call(createPercentAxis('left', yScale));
            }

            // Use the first data item for single bar display
            const classData = validData[0];
            const studentMeans = getStudentMeans(classData);
            if (!studentMeans || studentMeans.length === 0) return;

            const label = classData.className || 'Schule';
            const segments = buildRatingSegments(studentMeans, {
                meta: {
                    className: label,
                    mean: classData.statistics?.mean,
                },
            });

            const barWidth = Math.min(chartWidth * 0.8, 60);
            const barX = (chartWidth - barWidth) / 2;

            const barGroup = g
                .append('g')
                .attr('class', 'bar-group')
                .attr('transform', `translate(${barX}, 0)`);

            createSVGStackedBar(
                barGroup,
                segments,
                {
                    isHorizontal: false,
                    yScale,
                    barSize: barWidth,
                    fillOpacity: 0.85,
                    showLabels: !this.compact,
                    minLabelWidth: 30,
                    labelColor: getThemeColors().chrome.chartStroke,
                    labelFontWeight: 'var(--fw-semibold)',
                    labelFormatter: (segment) =>
                        segment.percentage >= 15 ? `${Math.round(segment.percentage)}%` : '',
                    getTooltipContent: this.compact
                        ? null
                        : (segment) => this.formatTooltipContent(segment),
                    tooltipId: this.compact ? null : 'self-efficacy',
                    hoverEffect: this.compact
                        ? null
                        : {
                              enter: { 'fill-opacity': 1 },
                              leave: { 'fill-opacity': 0.85 },
                          },
                },
                this,
            );

            // Add label below the bar
            if (!this.compact) {
                g.append('text')
                    .attr('x', chartWidth / 2)
                    .attr('y', chartHeight + VERTICAL_STACKED_BAR_LABEL_Y)
                    .attr('text-anchor', 'middle')
                    .style('fill', themeColors.chrome.textSecondary)
                    .style('font-weight', 'var(--fw-semibold)')
                    .text(label);
            }
        } else {
            // Horizontal orientation (original behavior)
            const xScale = d3.scaleLinear().domain([0, 100]).range([0, chartWidth]);
            const yScale = d3
                .scaleBand()
                .domain(validData.map((d) => d.className || 'Schule'))
                .range([0, chartHeight])
                .padding(0.3);

            // Store references for in-place visibility updates
            if (hasHtmlLegend) {
                this._spLayout = { svg, g, allValidData, chartHeight };
            }

            if (!this.compact) {
                g.append('g')
                    .attr('class', 'x-axis')
                    .attr('transform', `translate(0,${chartHeight})`)
                    .call(createPercentAxis('bottom', xScale, { step: 20 }));

                this.renderAxisTitle(g, 'bottom', `Anteil ${TERM_CONSTANTS.STUDENTS}`, {
                    fill: themeColors.chrome.textSecondary,
                    className: 'x-axis-label',
                });

                g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale));
            }

            // Render all rows (including hidden ones) so toggling always finds the element
            allValidData.forEach((classData) => {
                const label = classData.className || 'Schule';
                const isVisible = this.htmlLegend.isVisible('row', label);

                const studentMeans = getStudentMeans(classData);
                if (!studentMeans || studentMeans.length === 0) return;

                const segments = buildRatingSegments(studentMeans, {
                    meta: {
                        className: label,
                        mean: classData.statistics?.mean,
                    },
                });

                // Hidden rows sit at position 0; their position is corrected when toggled visible
                const barGroup = g
                    .append('g')
                    .attr('class', 'bar-group')
                    .attr('data-row-key', label)
                    .attr('transform', `translate(0,${yScale(label) ?? 0})`)
                    .style('opacity', isVisible ? 1 : 0)
                    .style('pointer-events', isVisible ? 'auto' : 'none')
                    .style('display', isVisible ? 'block' : 'none');

                createSVGStackedBar(
                    barGroup,
                    segments,
                    {
                        isHorizontal: true,
                        xScale,
                        barHeight: yScale.bandwidth(),
                        fillOpacity: 0.85,
                        showLabels: !this.compact,
                        minLabelWidth: 30,
                        labelColor: getThemeColors().chrome.chartStroke,
                        labelFormatter: (segment) =>
                            segment.percentage >= 10 ? `${Math.round(segment.percentage)}%` : '',
                        getTooltipContent: this.compact
                            ? null
                            : (segment) => this.formatTooltipContent(segment),
                        tooltipId: this.compact ? null : 'self-efficacy',
                        hoverEffect: this.compact
                            ? null
                            : {
                                  enter: { 'fill-opacity': 1 },
                                  leave: { 'fill-opacity': 0.85 },
                              },
                    },
                    this,
                );
            });

            if (legendConfig) this.#createLegend(svg, legendConfig);
        }
    }

    // Note: Tooltip cleanup is automatic via chartState.tooltipIds tracking

    /** Update bar positions and y-axis in-place when row visibility changes (no full re-render). */
    #updateChartVisibility() {
        const layout = this._spLayout;

        // Fall back to full re-render if layout is missing (e.g. first render hasn't completed yet)
        if (!layout) {
            this.renderChart();
            return;
        }

        const { g, allValidData, chartHeight } = layout;
        const DURATION = motionDuration(300);

        const visibleData = allValidData.filter((d) =>
            this.htmlLegend.isVisible('row', d.className || 'Schule'),
        );

        // Nothing visible — fall back to full re-render (shouldn't occur due to 1-pill guard)
        if (visibleData.length === 0) {
            this.renderChart();
            return;
        }

        // Rebuild y band scale with only visible rows
        const newYScale = d3
            .scaleBand()
            .domain(visibleData.map((d) => d.className || 'Schule'))
            .range([0, chartHeight])
            .padding(0.3);

        const newBandwidth = newYScale.bandwidth();

        // Animate each bar group into its new position, or fade it out
        g.selectAll('g.bar-group').each(function () {
            const group = d3.select(this);
            const rowKey = group.attr('data-row-key');
            if (!rowKey) return;

            const isVisible = visibleData.some((d) => (d.className || 'Schule') === rowKey);

            if (isVisible) {
                group
                    .style('display', 'block')
                    .transition()
                    .duration(DURATION)
                    .attr('transform', `translate(0,${newYScale(rowKey)})`)
                    .style('opacity', 1)
                    .style('pointer-events', 'auto');

                // Transition segment heights and label midpoints to the new bandwidth
                group
                    .selectAll('.bar-segment')
                    .transition()
                    .duration(DURATION)
                    .attr('height', newBandwidth);

                group
                    .selectAll('.bar-label')
                    .transition()
                    .duration(DURATION)
                    .attr('y', newBandwidth / 2);
            } else {
                group
                    .transition()
                    .duration(DURATION)
                    .style('opacity', 0)
                    .style('pointer-events', 'none')
                    .on('end', function () {
                        d3.select(this).style('display', 'none');
                    });
            }
        });

        // Update y-axis to reflect new visible domain
        const yAxis = g.select('.y-axis').call(d3.axisLeft(newYScale));
        this.normalizeSvgTypography(yAxis);
    }

    /**
     * Build legend item descriptors for rating categories.
     * @returns {Array<object>} One swatch per rating band, in band order.
     */
    #buildLegendItems() {
        return RATING_CATEGORIES.map((cat) => ({
            color: cat.color,
            label: formatRatingCategoryLabel(cat),
            symbol: 'rect',
            symbolSize: 14,
            rx: 2,
            stroke: 'none',
        }));
    }

    /**
     * Create the measured SVG fallback legend.
     * @param {d3.Selection} svg - The chart root the legend is drawn into.
     * @param {object} legendConfig - The legend's entries and measured layout.
     */
    #createLegend(svg, legendConfig) {
        this.legend.createLegend({
            svg,
            ...legendConfig,
            legendIndex: 0,
        });
    }

    // ========================================================================
    // HTML LEGEND
    // ========================================================================

    /**
     * Legend sections: interactive row pills (at least one stays on) and the
     * display-only rating swatches.
     * @param {Array<object>} allValidData - The rows the pills toggle.
     * @returns {Array<import('../../../../common/charts/legend/htmlLegendController.js').HtmlLegendSection>} What the panel shows.
     */
    #legendSections(allValidData) {
        return [
            {
                title: 'Klassen',
                group: 'row',
                minVisible: 1,
                items: allValidData.map((d) => {
                    const label = d.className || 'Schule';
                    return { key: label, label };
                }),
            },
            {
                render: (panel) => {
                    appendHtmlLegendSwatchSection(
                        panel,
                        'Bewertung',
                        RATING_CATEGORIES.map((cat) => ({
                            color: cat.color,
                            label: formatRatingCategoryLabel(cat),
                        })),
                    );
                    return [];
                },
            },
        ];
    }
}
