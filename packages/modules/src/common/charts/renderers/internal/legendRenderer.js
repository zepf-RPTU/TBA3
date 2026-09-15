/**
 * LegendRenderer — SVG legend creation, measurement, and adaptive layout.
 *
 * The legend concern is a collaborator the renderer *has* (`renderer.legend`),
 * not a ~500-line slice of the base class every renderer inherits. It holds a
 * back-reference to its host renderer for the shared primitives it needs (SVG
 * root, computed layout, dimensions, font/measurement helpers, glossary
 * annotation) and delegates the pure geometry to `svgLegendLayout.js`.
 * @module legendRenderer
 */

import { renderLegendSymbol } from '../../markerSymbols.js';
import { getThemeColors } from '../../../services/themeService.js';
import {
    LEGEND_DEFAULTS,
    canDistributeLegendItemsEvenly as canDistributeSvgLegendItemsEvenly,
    estimateLegendItemWidth as estimateSvgLegendItemWidth,
    getLegendItemTextX as getSvgLegendItemTextX,
    resolveAdaptiveLegendLayout as resolveSvgAdaptiveLegendLayout,
    resolveLegendGeometry as resolveSvgLegendGeometry,
    resolveLegendLayoutForSlot as resolveSvgLegendLayoutForSlot,
    resolveMeasuredLegendLayout as resolveSvgMeasuredLegendLayout,
    resolveStackedLegendLayout as resolveSvgStackedLegendLayout,
} from './svgLegendLayout.js';
import * as d3 from 'd3';

export class LegendRenderer {
    /**
     * @param {import('../chartRenderer.js').ChartRenderer} host - Owning renderer,
     *   source of the shared SVG root, layout, dimensions, and measurement helpers.
     */
    constructor(host) {
        /** @type {any} */
        this.host = host;
    }

    /**
     * Create a standardized chart legend using D3 data-join.
     * Returns the root <g> selection for further customization or
     * use in _getVisibilityConfig() for opacity toggling.
     * @param {object} config - Legend configuration
     * @returns {*} The root legend <g> selection
     */
    createLegend(config) {
        const {
            svg = this.host.svg,
            items,
            layout = {},
            title = null,
            textColor: textColorOverride,
            symbolSize: defaultSymbolSize = LEGEND_DEFAULTS.symbolSize,
            cssClass = 'legend',
            itemClass = 'legend-item',
        } = config;

        const direction = layout.direction ?? 'horizontal';
        const symbolTextGap =
            layout.symbolTextGap ??
            LEGEND_DEFAULTS.symbolTextGap[direction === 'vertical' ? 'vertical' : 'horizontal'];

        // One geometry for measurement and rendering: anchor, title offset and
        // item positions come from the same resolution measureLegendSize uses.
        const slot =
            config.legendIndex != null
                ? (this.host.layout?.legends?.[config.legendIndex] ?? null)
                : null;
        const { anchor, itemPositions } = this.#resolveGeometry(config, slot);

        const fontSize = this.host.getChartTextMeasureSize({ fontSize: config.fontSize });
        const colors = getThemeColors();
        const textColor = textColorOverride ?? colors.chrome.text;

        // Create root group
        const legend = svg.append('g').attr('class', cssClass);

        legend.attr('transform', `translate(${anchor.x}, ${anchor.y})`);

        // Optional title
        if (title) {
            legend
                .append('text')
                .attr('x', 0)
                .attr('y', fontSize)
                .attr('text-anchor', 'start')
                .style('font-weight', 'bold')
                .style('fill', textColor)
                .text(title);
        }

        // Create legend items via D3 data-join
        const legendItems = legend
            .selectAll(`.${itemClass}`)
            .data(items)
            .enter()
            .append('g')
            .attr('class', (d) => {
                const base = itemClass;
                return d.className ? `${base} ${d.className}` : base;
            })
            // Identity that cannot go in a class name: a legend entry standing for one
            // data-delivered group is keyed by that group's own id, which is not a safe
            // CSS identifier. Callers pass `dataAttributes: {'group-id': …}`.
            .each((d, i, nodes) => {
                if (!d.dataAttributes) return;
                const item = d3.select(nodes[i]);
                for (const [name, value] of Object.entries(d.dataAttributes)) {
                    item.attr(`data-${name}`, value);
                }
            })
            .attr('transform', (d, i) => `translate(${itemPositions[i].x}, ${itemPositions[i].y})`)
            .style('opacity', (d) => d.opacity ?? 1);

        // Render symbols
        legendItems.each(function (d) {
            const group = d3.select(this);
            // Build options object, only including overrides
            const symbolOptions = {
                color: d.color || getThemeColors().chrome.textSecondary,
            };
            if (d.appearance !== undefined) symbolOptions.appearance = d.appearance;
            if (d.dotFill !== undefined) symbolOptions.dotFill = d.dotFill;
            if (d.symbolSize !== undefined) symbolOptions.size = d.symbolSize;
            if (d.symbolSize === undefined && defaultSymbolSize !== LEGEND_DEFAULTS.symbolSize)
                symbolOptions.size = defaultSymbolSize;
            if (d.stroke !== undefined) symbolOptions.stroke = d.stroke;
            if (d.strokeWidth !== undefined) symbolOptions.strokeWidth = d.strokeWidth;
            if (d.rx !== undefined) symbolOptions.rx = d.rx;

            renderLegendSymbol(group, d.symbol || 'circle', symbolOptions);
        });

        // Render labels
        legendItems
            .append('text')
            .attr('x', (d) => this.getLegendItemTextX(d, { defaultSymbolSize, symbolTextGap }))
            .attr('y', 0)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'start')
            .style('fill', textColor)
            .each((d, i, nodes) => {
                const labelSelection = d3.select(nodes[i]);
                // An item that splits its own label into segments keeps the glossary
                // link on the part that is actually the term: `L1 = Landesschnitt`
                // must not make the ordinal a glossary hotspot. Takes precedence over
                // `glossaryKey`, which stamps the whole string.
                if (Array.isArray(d.labelSegments) && d.labelSegments.length > 0) {
                    this.host.renderGlossaryTextSegments(labelSelection, d.label, {
                        segments: d.labelSegments,
                        force: true,
                    });
                    return;
                }

                if (d.glossaryKey) {
                    labelSelection.text(d.label);
                    this.host.stampGlossaryAttr(labelSelection, d.glossaryKey);
                    return;
                }

                this.host.renderGlossaryTextSegments(labelSelection, d.label);
            });

        return legend;
    }

    /**
     * Resolve the text start x-offset for a legend item based on its symbol geometry.
     * @param {object} item - The legend item whose symbol geometry sets the text offset.
     * @param {object} [options] - Font and symbol overrides; anything omitted falls back to the host chart’s resolved typography.
     * @returns {number} X offset in px where the label text starts.
     */
    getLegendItemTextX(item, options = {}) {
        return getSvgLegendItemTextX(item, options);
    }

    /**
     * Measure a legend text label once per renderer instance and font configuration.
     * @param {string} text - Label to measure; an empty value measures as zero.
     * @param {object} [options] - Font and symbol overrides; anything omitted falls back to the host chart’s resolved typography.
     * @returns {{ width: number, height: number }} Measured label box, served from the per-renderer cache when possible.
     */
    getLegendTextMeasurement(text, options = {}) {
        const label = String(text ?? '');
        if (!label) {
            return { width: 0, height: 0 };
        }

        const fontSize = this.host.getChartTextMeasureSize(options);
        const fontFamily = options.fontFamily ?? this.host.getChartFont();
        const fontWeight = options.fontWeight ?? null;
        const cache =
            this.host.chartState.legendTextMeasurementCache ??
            (this.host.chartState.legendTextMeasurementCache = new Map());
        const cacheKey = JSON.stringify([label, fontSize, fontFamily, fontWeight ?? '']);

        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }

        const measured = this.host.measureTexts([label], { fontSize, fontFamily, fontWeight });
        const metrics = {
            width: measured.maxWidth,
            height: measured.maxHeight,
        };

        cache.set(cacheKey, metrics);
        return metrics;
    }

    /**
     * Resolve the text width used for legend item layout.
     * Falls back to measuring the label when `textWidth` is not precomputed.
     * @param {object} item - The legend item; a finite `textWidth` on it is trusted as already measured.
     * @param {object} [options] - Font and symbol overrides; anything omitted falls back to the host chart’s resolved typography.
     * @returns {number} Label width in px used for layout.
     */
    getLegendItemTextWidth(item, options = {}) {
        if (Number.isFinite(item?.textWidth)) {
            return item.textWidth;
        }

        const label = String(item?.label ?? '');
        if (!label) {
            return 0;
        }

        const fontSize = this.host.getChartTextMeasureSize(options);
        const fontFamily = options.fontFamily ?? this.host.getChartFont();
        const fontWeight = options.fontWeight ?? null;

        return this.getLegendTextMeasurement(label, { fontSize, fontFamily, fontWeight }).width;
    }

    /**
     * Estimate the rendered width of a horizontal legend item.
     * @param {object} item - The legend item to size.
     * @param {object} [options] - Font and symbol overrides; anything omitted falls back to the host chart’s resolved typography.
     * @returns {number} Symbol, gap and label width combined.
     */
    estimateLegendItemWidth(item, options = {}) {
        const textWidth = this.getLegendItemTextWidth(item, options);

        return estimateSvgLegendItemWidth(item, { ...options, textWidth });
    }

    /**
     * Check whether legend items fit into equal-width horizontal slots.
     * @param {Array<object>} items - The legend items to place.
     * @param {number} availableWidth - Width the row has to fit into.
     * @param {object} [options] - Font and symbol overrides; anything omitted falls back to the host chart’s resolved typography.
     * @returns {boolean} True when equal-width slots hold every item, so the row layout can be used.
     */
    canDistributeLegendItemsEvenly(items, availableWidth, options = {}) {
        return canDistributeSvgLegendItemsEvenly(items, availableWidth, (item) =>
            this.estimateLegendItemWidth(item, options),
        );
    }

    /**
     * Resolve the shared measurement options used by legend layout helpers.
     * @param {object} [overrides] - Values to use instead of the host chart’s resolved typography and symbol defaults.
     * @returns {{ fontSize: number, fontFamily: string, defaultSymbolSize: number, symbolTextGap: number }} The measurement options every legend helper shares, so they cannot disagree.
     */
    getLegendMeasurementOptions(overrides = {}) {
        return {
            fontSize: this.host.getChartTextMeasureSize(overrides),
            fontFamily: overrides.fontFamily ?? this.host.getChartFont(),
            defaultSymbolSize: overrides.defaultSymbolSize ?? LEGEND_DEFAULTS.symbolSize,
            symbolTextGap: overrides.symbolTextGap ?? LEGEND_DEFAULTS.symbolTextGap.horizontal,
        };
    }

    /**
     * Calculate the width budget for bottom/top legends that share space with axes.
     * @param {object} [options] - Axis insets (`left`, `right`), a `buffer`, and a `containerWidth` override when the chart is not yet measured.
     * @returns {number} Width in px left for the legend once the axes have taken their space.
     */
    getAvailableLegendSlotWidth(options = {}) {
        const { left = 0, right = 0, buffer = 16, containerWidth = null } = options;
        const dims = this.host.dimensions || this.host.calculateDimensions();
        const width = Number.isFinite(containerWidth) ? containerWidth : dims.containerWidth;

        return Math.max(0, width - left - right - buffer);
    }

    /**
     * Resolve the best measured layout candidate for a single SVG legend.
     * @param {object} legendConfig - Base legend config, as passed to `createLegend()`.
     * @param {Array<object>} [candidates] - Alternative configs to measure, in preference order.
     * @param {object} [constraints] - Width and height budgets a candidate has to fit.
     * @returns {{config: object, layout: object, size: {width: number, height: number}, candidate: object, index: number, fits: boolean}} The winning candidate with its measured geometry; `fits` is false when even the last one overflows.
     */
    resolveMeasuredLegendLayout(legendConfig, candidates = [], constraints = {}) {
        return resolveSvgMeasuredLegendLayout(legendConfig, candidates, constraints, (config) =>
            this.measureLegendSize(config),
        );
    }

    /**
     * Resolve multiple SVG legend blocks that share one vertical legend slot.
     * @param {Array<{config: object, candidates?: Array<object>}>} entries - The legend blocks sharing the slot, in stack order.
     * @param {object} [options] - Slot budget and the gap between stacked blocks.
     * @returns {{entries: Array<object>, size: {width: number, height: number}, gap: number, fits: boolean}} One resolved entry per block plus the stack’s total size.
     */
    resolveStackedLegendLayout(entries, options = {}) {
        return resolveSvgStackedLegendLayout(
            entries,
            options,
            (legendConfig, candidates, constraints) =>
                this.resolveMeasuredLegendLayout(legendConfig, candidates, constraints),
        );
    }

    /**
     * Render a resolved stacked legend layout into a measured legend slot.
     * @param {object} config - Where to draw, and what to draw.
     * @param {SVGElement} [config.svg] - SVG root to render into; defaults to the host renderer’s own root.
     * @param {object} config.stackLayout - Resolved layout from `resolveSvgStackedLegendLayout`: the entries and their measured size.
     * @param {{x: number, y: number, width: number, height: number}|null} [config.slot] - Measured slot to place the stack in; null anchors it at the origin.
     * @param {string} [config.align] - Horizontal alignment of each row within the slot ('start' unless the caller measured otherwise).
     * @returns {Array<*>} One rendered entry per layout row, in draw order; empty when the layout has no entries.
     */
    createLegendStack({ svg = this.host.svg, stackLayout, slot = null, align = 'start' }) {
        if (!stackLayout?.entries?.length) return [];

        const originX = slot?.x ?? 0;
        const originY = slot?.y ?? 0;
        const slotWidth = slot?.width ?? stackLayout.size.width;
        const slotHeight = slot?.height ?? stackLayout.size.height;
        // The stack sits centred in its slot.
        let currentY = originY + Math.max(0, (slotHeight - stackLayout.size.height) / 2);

        return stackLayout.entries.map((result) => {
            let currentX = originX;
            if (align === 'center') {
                currentX += Math.max(0, (slotWidth - result.size.width) / 2);
            } else if (align === 'end') {
                currentX += Math.max(0, slotWidth - result.size.width);
            }

            const legend = this.createLegend({
                svg,
                ...result.config,
                layout: {
                    ...result.config.layout,
                    position: { x: currentX, y: currentY },
                },
            });
            currentY += result.size.height + stackLayout.gap;
            return legend;
        });
    }

    /**
     * Resolve an adaptive SVG legend layout using the shared overflow strategy:
     * horizontal distributed row, then multi-column vertical, then single-column vertical.
     * @param {Array<object>} items - The legend items to place.
     * @param {number} availableWidth - Width the legend has to fit into.
     * @param {object} [options] - Measurement overrides and layout constraints forwarded to each strategy.
     * @returns {object} The first strategy’s layout that fits, or the single-column fallback.
     */
    resolveAdaptiveLegendLayout(items, availableWidth, options = {}) {
        return resolveSvgAdaptiveLegendLayout(items, availableWidth, options, {
            getMeasurementOptions: (overrides) => this.getLegendMeasurementOptions(overrides),
            canDistributeItems: (legendItems, width, measureOptions) =>
                this.canDistributeLegendItemsEvenly(legendItems, width, measureOptions),
            resolveMeasuredLayout: (legendConfig, candidates, constraints) =>
                this.resolveMeasuredLegendLayout(legendConfig, candidates, constraints),
        });
    }

    /**
     * Apply a computed layout slot to a legend config before rendering.
     * @param {object} legendConfig - Base legend config, as passed to `createLegend()`.
     * @param {object | null} slot - The computed slot to place the legend in; null anchors it at the origin.
     * @returns {object} The config with slot-derived anchor and item positions applied.
     */
    resolveLegendLayoutForSlot(legendConfig, slot) {
        return resolveSvgLegendLayoutForSlot(legendConfig, slot, (config) =>
            this.measureLegendSize(config),
        );
    }

    /**
     * Measure a legend's total dimensions without rendering it.
     *
     * Measurement's one job is to predict what createLegend() will draw, so both
     * read the same resolved geometry — measurement takes its `size`, rendering
     * its anchor and item positions. Agreement is by construction, not by two
     * formulas that must be kept in sync.
     * @param {object} legendConfig - Same config format as createLegend()
     * @returns {{ width: number, height: number }} The box `createLegend()` would draw, taken from the same resolved geometry.
     */
    measureLegendSize(legendConfig) {
        return this.#resolveGeometry(legendConfig, null).size;
    }

    /**
     * Resolve the shared legend geometry, binding the host's cached text
     * measurement and resolved font into the pure resolver.
     * @param {object} config - Same config format as createLegend()
     * @param {object | null} slot - Computed-layout slot when rendering via legendIndex
     * @returns {ReturnType<typeof resolveSvgLegendGeometry>} Anchor, item positions and total size, with the host’s cached measurement bound in.
     */
    #resolveGeometry(config, slot) {
        const fontSize = this.host.getChartTextMeasureSize({ fontSize: config.fontSize });
        const fontFamily = config.font ?? this.host.getChartFont();

        return resolveSvgLegendGeometry(config, {
            measureText: (text, options = {}) =>
                this.getLegendTextMeasurement(text, {
                    fontSize,
                    fontFamily,
                    ...options,
                }),
            fontSize,
            slot,
        });
    }
}
