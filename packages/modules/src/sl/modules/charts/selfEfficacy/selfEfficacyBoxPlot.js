/**
 * Self-Efficacy Box Plot — the distribution of per-student Selbstwirksamkeit means
 * per class as a box plot, with a compact mode for thumbnail watermarks.
 */

import { BarChartRenderer } from '../../../../common/charts/renderers/barChartRenderer.js';
import { appendBoxGradient, drawBoxPlotFigure } from '../shared/boxPlotFigure.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import {
    chartLayoutPreset,
    createRatingAxis,
    measureCategoryAxisSpace,
    measureRatingAxisSpace,
} from '../../../../common/charts/chartAxisUtils.js';
import {
    LABEL_LINE_HEIGHT,
    fitLabelLine,
    measureExtraLabelLineSpace,
    splitLabelLines,
} from '../../../../common/charts/chartLabelFit.js';
import * as d3 from 'd3';

const MAX_BOX_WIDTH = 60;
const BOX_WIDTH_RATIO = 0.6;
const WHISKER_CAP_WIDTH_RATIO = 0.6;
/** Breathing room between two neighbouring box labels, in px. */
const BOX_LABEL_GAP = 8;

/**
 * Self-Efficacy Box Plot Chart Class
 */
export class SelfEfficacyBoxPlot extends BarChartRenderer {
    constructor(containerId, data, options = {}) {
        const yMin = options.yMin ?? 1;
        const yMax = options.yMax ?? 5;
        if (yMin >= yMax) {
            throw new Error(
                `Invalid y-axis range: yMin (${yMin}) must be less than yMax (${yMax})`,
            );
        }

        // Default dimensions used when container has no size
        const defaultWidth = 600;
        const defaultHeight = options.height ?? 400;
        const compact = options.compact === true;

        super(containerId, {
            defaultWidth,
            defaultHeight,
            autoResize: true,
            ...options,
            layout: chartLayoutPreset(compact ? 'compactNoAxis' : 'paddedNoLegend'),
        });

        this.data = data;
        this.compact = compact;
        const themeColors = getThemeColors();
        this.config = {
            yMin,
            yMax,
            // Store defaults for container-based sizing fallback
            defaultWidth,
            defaultHeight,
            showLabels: compact ? options.showLabels === true : options.showLabels !== false,
            color: options.color ?? themeColors.sl.selfEfficacy,
            // Faded far end of the box gradient — a single-hue band (no separate secondary color).
            colorSecondary: options.colorSecondary ?? themeColors.sl.selfEfficacy,
            ...options,
        };
        // Store cache in chartState for automatic cleanup
        this.chartState.cache = { validData: null };
    }

    validateData() {
        return this.getValidData().length > 0;
    }
    /**
     * Format tooltip content for box plot data
     * @param {object} segment - Contains boxData and stats
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment) {
        const { boxData, stats } = segment;
        const rows = [
            { label: 'Median', value: stats.median.toFixed(2) },
            { label: 'Mittelwert', value: stats.mean.toFixed(2) },
            { label: 'Std.-Abw.', value: stats.standardDeviation.toFixed(2) },
            { label: 'Q1 / Q3', value: `${stats.q1.toFixed(2)} / ${stats.q3.toFixed(2)}` },
            { label: 'Min / Max', value: `${stats.min.toFixed(2)} / ${stats.max.toFixed(2)}` },
        ];

        let footer = `Anzahl: <strong>${boxData.count}</strong>`;
        if (stats.outlierCount > 0) {
            footer += `<br>Ausreißer: <strong>${stats.outlierCount}</strong>`;
        }

        return this.buildTooltipHTML({
            title: boxData.className || 'Daten',
            rows,
            footer,
        });
    }

    /**
     * Cache and return data entries that have valid .statistics.
     * @returns {Array<object>} The entries with statistics; the rest are dropped rather than drawn as empty boxes.
     */
    getValidData() {
        if (!this.chartState.cache.validData) {
            this.chartState.cache.validData = (
                Array.isArray(this.data) ? this.data : [this.data]
            ).filter((d) => d?.statistics);
        }
        return this.chartState.cache.validData;
    }

    setData(data) {
        this.data = data;
        this.chartState.cache.validData = null;
    }

    /** Build SVG, scales, grid, gradient, and iterate data to draw each box plot. */
    renderChart() {
        this.clearContainer();
        const validData = this.getValidData();
        const themeColors = getThemeColors();
        if (validData.length === 0) {
            this.showNoDataMessage();
            return;
        }

        const leftAxis = this.compact
            ? 0
            : measureRatingAxisSpace(this, 'left', {
                  min: this.config.yMin,
                  max: this.config.yMax,
              });
        // Free-text class names wrap over up to two lines (`splitLabelLines`), so
        // the reserve measures the lines that will actually be drawn plus the
        // second line's height when any label needs it.
        const boxLabels = validData.map((d, i) => d.className || `${i + 1}`);
        const bottomAxis = this.compact
            ? 0
            : measureCategoryAxisSpace(this, 'bottom', boxLabels.flatMap(splitLabelLines)) +
              measureExtraLabelLineSpace(this.resolveChartTextSize('base'), boxLabels);

        const { svg, g, layout } = this.initializeSVG({
            axisOverrides: { left: leftAxis, bottom: bottomAxis },
        });

        const plotWidth = layout.chart.width;
        const plotHeight = layout.chart.height;
        const baseBoxWidth = Math.min(
            (plotWidth / validData.length) * BOX_WIDTH_RATIO,
            MAX_BOX_WIDTH,
        );
        const boxWidth = baseBoxWidth * 1.5;
        const spacing = plotWidth / validData.length;
        const capWidth = boxWidth * WHISKER_CAP_WIDTH_RATIO;

        const yScale = d3
            .scaleLinear()
            .domain([this.config.yMin, this.config.yMax])
            .range([plotHeight, 0]);

        if (!this.compact) {
            g.append('g')
                .attr('class', 'y-axis')
                .call(createRatingAxis('left', yScale))
                .selectAll('text')
                .style('fill', themeColors.chrome.textSecondary);

            this.grid.createGridLines(g, {
                yScale,
                chartWidth: plotWidth,
                yTicks: 5,
            });
        }

        svg.select('defs').remove();
        appendBoxGradient(svg.append('defs'), `box-gradient-${this.containerId}`, {
            color: this.config.color,
            endColor: this.config.colorSecondary,
        });

        const totalBoxesWidth = validData.length * spacing;
        const centerOffset = (plotWidth - totalBoxesWidth) / 2;

        validData.forEach((boxData, index) => {
            this.renderBoxPlot(g, boxData, index, {
                centerOffset,
                spacing,
                boxWidth,
                capWidth,
                yScale,
                plotHeight,
                themeColors,
            });
        });
    }

    /**
     * Draw a single box plot, plus this chart's own label and hover area around it.
     * @param {d3.Selection} g - The plot group the box is drawn into.
     * @param {object} boxData - The row this box stands for, carrying its statistics.
     * @param {number} index - Its position, which fixes its slot.
     * @param {object} params - The shared geometry and theme for this render.
     */
    renderBoxPlot(g, boxData, index, params) {
        const { centerOffset, spacing, boxWidth, capWidth, yScale, plotHeight, themeColors } =
            params;
        const stats = boxData.statistics;
        const centerX = centerOffset + spacing * index + spacing / 2;

        drawBoxPlotFigure(g, stats, {
            centerX,
            boxWidth,
            capWidth,
            yScale,
            color: this.config.color,
            fill: `url(#box-gradient-${this.containerId})`,
        });

        if (this.config.showLabels) {
            // Free-text class names wrap over up to two lines (stacked downwards,
            // so the first line keeps the single-line baseline), each fitted to
            // the box pitch as a last resort. The tooltip carries the name in full.
            const label = g
                .append('text')
                .attr('x', centerX)
                .attr('y', plotHeight + 20)
                .attr('text-anchor', 'middle')
                .style('font-weight', 'var(--fw-semibold)')
                .style('fill', themeColors.chrome.textSecondary);
            const lines = splitLabelLines(boxData.className || `${index + 1}`);
            const lineHeight = this.resolveChartTextSize('base') * LABEL_LINE_HEIGHT;
            const slot = Math.max(0, spacing - BOX_LABEL_GAP);
            lines.forEach((line, lineIndex) => {
                label
                    .append('tspan')
                    .attr('x', centerX)
                    .attr('y', plotHeight + 20)
                    .attr('dy', `${lineIndex * lineHeight}px`)
                    .text(fitLabelLine(this, line, slot, { fontWeight: 'var(--fw-semibold)' }));
            });
        }

        if (this.compact) {
            return;
        }

        const hoverArea = g
            .append('rect')
            .attr('x', centerX - boxWidth / 2 - 5)
            .attr('y', 0)
            .attr('width', boxWidth + 10)
            .attr('height', plotHeight)
            .attr('fill', 'transparent');

        this.wireTooltipEvents(hoverArea, {
            getTooltipContent: () => this.formatTooltipContent({ boxData, stats }),
            tooltipId: 'self-efficacy',
        });
    }

    // Note: Tooltip cleanup is automatic via chartState.tooltipIds tracking
}
