/**
 * BarChartRenderer - Base class for D3.js bar charts with stacked bar utilities.
 * Extends ChartRenderer with bar-specific functionality.
 *
 * Features:
 * - SVG-based (D3) stacked bars for charts
 * - Horizontal and vertical orientations
 * - Flexible styling via CSS classes or inline styles
 * - Configurable segments, colors, labels, tooltips, and interactions
 * - Preset configurations for common chart patterns (KS distribution, etc.)
 * @abstract
 */

import {
    ChartRenderer,
    DEFAULT_CHART_HOVER_OPACITY,
    createOpacityHoverEffect,
} from './chartRenderer.js';
import { getCompetencyAppearance, getThemeColors } from '../../services/themeService.js';
import { getCompetencyLevelClassToken } from '../chartUtils.js';
import {
    buildStackedSegments,
    computeStackedBarRects,
    insetStackedSegment,
    SVG_BAR_CONFIG,
} from '../stackedBarUtils.js';
import * as d3 from 'd3';

/** @typedef {d3.Selection<any, any, any, any>} D3Selection */

/**
 * One stacked segment as `buildStackedSegments` produces it. Callers hang more on it
 * (`key`, `parentData`, `totalCount`, …), hence the open tail.
 * @typedef {{
 *   field: string,
 *   label: string,
 *   value: number,
 *   percentage: number,
 *   normalizedValue: number,
 *   color?: string,
 *   key?: string,
 *   appearance?: *,
 *   [extra: string]: *,
 * }} StackedSegment
 */

/**
 * `createSVGStackedBar` options, merged over `SVG_BAR_CONFIG`.
 * @typedef {object} StackedBarConfig
 * @property {string} [orientation] - `'horizontal'` or `'vertical'`; `isHorizontal` wins when set.
 * @property {boolean} [isHorizontal] - Explicit orientation flag.
 * @property {number} [width] - Bar extent in px (horizontal bars).
 * @property {number} [height] - Bar extent in px (vertical bars) or bar thickness (horizontal).
 * @property {number} [barHeight] - Bar thickness override.
 * @property {number} [barSize] - Bar thickness override (vertical bars).
 * @property {d3.ScaleBand<string>|*} [xScale] - Positioning scale along x.
 * @property {*} [yScale] - Positioning scale along y.
 * @property {string} [barGroupClass] - Class of the wrapping `<g>`.
 * @property {object} [context] - Datum bound to the bar group and handed to every callback.
 * @property {number} [fillOpacity] - Resting segment opacity.
 * @property {number} [hoverOpacity] - Hovered segment opacity.
 * @property {string} [stroke] - Divider stroke, used only when `segmentGap` is 0.
 * @property {number} [strokeWidth] - Divider stroke width.
 * @property {number} [segmentGap] - Surface gap between adjacent fills in px.
 * @property {(d: StackedSegment) => number} [getX] - Injected geometry accessors; win over the computed table.
 * @property {(d: StackedSegment) => number} [getY] - See `getX`.
 * @property {(d: StackedSegment) => number} [getWidth] - See `getX`.
 * @property {(d: StackedSegment) => number} [getHeight] - See `getX`.
 * @property {string|null} [highlightedKey] - Level key drawn with the highlight stroke.
 * @property {string|((d: StackedSegment, context?: object) => string)|null} [cursor] - CSS cursor over a segment.
 * @property {boolean} [showLabels] - Draw a label inside each wide-enough segment.
 * @property {number} [minLabelWidth] - Minimum segment extent for a label.
 * @property {number} [minWidthForLabel] - Alias of `minLabelWidth`.
 * @property {string} [labelColor] - Label fill.
 * @property {string} [labelFontWeight] - Label weight.
 * @property {(segment: StackedSegment, tier?: {withShare: boolean, lines?: boolean}) => string | string[]} [labelFormatter] - Label text per segment; asked for the `withShare` form first, which is kept when it fits, then (vertical bars) for its two `lines`, then for the short form (see `levelShareLabelFormatter`).
 * @property {((d: StackedSegment, context?: object) => string)|null} [getTooltipContent] - Tooltip markup per segment; none means no tooltip.
 * @property {string|null} [tooltipId] - Tooltip id for `wireTooltipEvents`.
 * @property {*} [hoverEffect] - Hover enter/leave style map.
 * @property {((event: Event, d: StackedSegment, element: Element, context?: object) => void)|null} [onClick] - Click handler.
 * @property {((d: StackedSegment, event: Event, element: Element, context?: object) => void)|null} [onHover] - Hover handler.
 * @property {((d: StackedSegment, event: Event, element: Element, context?: object) => void)|null} [onLeave] - Leave handler.
 */

/**
 * The scales a chart bar is drawn against.
 * @typedef {object} BarScales
 * @property {*} [xScale] - Band scale along x.
 * @property {*} [yScale] - Linear scale along y.
 */

/**
 * `createChartStackedBar` / `createChartStackedBars` options.
 * @typedef {object} ChartStackedBarOptions
 * @property {ChartRenderer|null} [chartInstance] - Chart for `wireTooltipEvents`, when not passed as the last argument.
 * @property {number} [barWidth] - Bar thickness; defaults to the x band width.
 * @property {number} [xPosition] - Horizontal offset of the bar group.
 * @property {object} [context] - Extra fields merged into the callback context.
 * @property {string} [barGroupClass] - Class of the inner stacked-bar group.
 * @property {number} [fillOpacity] - Resting segment opacity.
 * @property {number} [hoverOpacity] - Hovered segment opacity.
 * @property {string} [stroke] - Divider stroke.
 * @property {number} [strokeWidth] - Divider stroke width.
 * @property {string|((d: StackedSegment, data: object, context: object) => string)} [cursor] - CSS cursor over a segment.
 * @property {(data: object, stackedEntry: object, level: string, context: object) => string} [getTooltipContent] - Tooltip markup per level.
 * @property {string|null} [tooltipId] - Tooltip id.
 * @property {*} [hoverEffect] - Hover enter/leave style map.
 * @property {(event: Event, data: object, level: string, context: object) => void} [onClick] - Click handler.
 * @property {(event: Event, data: object, stackedEntry: object, level: string, context: object) => void} [onHover] - Hover handler.
 * @property {(event: Event, data: object, level: string, context: object) => void} [onLeave] - Leave handler.
 * @property {string|null} [highlightedKey] - Level key drawn with the highlight stroke.
 * @property {boolean} [showLabels] - Draw segment labels.
 * @property {number} [minLabelWidth] - Minimum segment extent for a segment label.
 * @property {StackedBarConfig['labelFormatter']} [labelFormatter] - Segment label text, tiered.
 * @property {boolean} [showLabel] - Draw the bar's own label (`labelText`).
 * @property {string} [labelText] - The bar label.
 * @property {number} [labelY] - Label baseline; negative means above the bar.
 * @property {string} [labelFontWeight] - Label weight.
 * @property {string} [fontFamily] - Label font family.
 * @property {string} [labelColor] - Label fill.
 */

// ============================================================================
// SVG-BASED STACKED BAR (D3)
// ============================================================================

/** Air either side of a segment label before its long form is dropped, px. */
const LABEL_FIT_PAD = 3;

/**
 * Creates SVG stacked bar segments using D3
 * @param {D3Selection} g - D3 selection
 * @param {StackedSegment[]} segments - Processed segment data
 * @param {StackedBarConfig} config - Configuration options (may embed xScale/yScale)
 * @param {ChartRenderer|null} [chartInstance] - Optional chart instance for wireTooltipEvents
 * @returns {D3Selection} D3 selection of created bar groups
 */
export function createSVGStackedBar(g, segments, config = {}, chartInstance = null) {
    config = { ...SVG_BAR_CONFIG, ...config };

    const isHorizontal =
        config.isHorizontal === true ||
        (config.isHorizontal !== false && config.orientation === 'horizontal');
    const { xScale, yScale } = config;
    const barSize =
        config.barHeight ||
        config.barSize ||
        (isHorizontal ? config.height : xScale?.bandwidth?.() || 40);

    const barGroup = g.append('g').attr('class', config.barGroupClass || 'stacked-bar-group');

    if (config.context) {
        barGroup.datum(config.context);
    }

    const validSegments = segments.filter(
        (s) => s.normalizedValue > 0 || s.value > 0 || s.percentage > 0,
    );
    const getField = (d) => d.field || d.key || d.label;
    const getAppearance = (d) => d.appearance || getCompetencyAppearance(getField(d));
    const isCompetencySegment = (d) => !!getAppearance(d);
    const allCompetencySegments =
        validSegments.length > 0 && validSegments.every(isCompetencySegment);
    const getDefaultHoverEffect = () =>
        allCompetencySegments
            ? createOpacityHoverEffect({ enterOpacity: config.hoverOpacity })
            : {
                  enter: {
                      'fill-opacity': config.hoverOpacity ?? (config.fillOpacity ?? 0.9) + 0.1,
                  },
                  leave: { 'fill-opacity': config.fillOpacity },
              };

    const segmentGroups = barGroup
        .selectAll('.bar-segment-group')
        .data(validSegments)
        .enter()
        .append('g')
        .attr('class', (d) => `bar-segment-group segment-${getField(d)}`);

    // Segment geometry comes from the shared authority in stackedBarUtils —
    // scale application, orientation flip and the P7 surface-gap inset all live
    // there so every path which positions stacked segments (including the SL
    // competency legend-toggle re-stack) computes identical rects. Injected
    // getX/getY/getWidth/getHeight accessors win over the computed table (the
    // diverging-bar escape hatch, e.g. SL group comparison); their results get
    // the same inset applied here.
    const gap = Math.max(0, config.segmentGap ?? 0);
    const insetPos = (base, size) => insetStackedSegment(base, size, gap).pos;
    const insetSize = (size) => insetStackedSegment(0, size, gap).size;

    const rectTable = new Map();
    computeStackedBarRects(validSegments, {
        positionScale: isHorizontal ? xScale : yScale,
        extent: isHorizontal ? config.width : config.height,
        bandSize: barSize,
        isHorizontal,
        gap,
    }).forEach((rect) => rectTable.set(rect.segment, rect));

    // Stacking-axis geometry before the inset: injected accessor or the table.
    const stackPos = (d) => {
        const injected = isHorizontal ? config.getX : config.getY;
        return injected ? injected(d) : rectTable.get(d).preInset.pos;
    };
    const stackSize = (d) => {
        const injected = isHorizontal ? config.getWidth : config.getHeight;
        return injected ? injected(d) : rectTable.get(d).preInset.size;
    };
    // Cross-axis geometry: never inset.
    const crossPos = (d) => {
        const injected = isHorizontal ? config.getY : config.getX;
        if (injected) return injected(d);
        return isHorizontal ? rectTable.get(d).y : rectTable.get(d).x;
    };
    const crossSize = (d) => {
        const injected = isHorizontal ? config.getHeight : config.getWidth;
        if (injected) return injected(d);
        return isHorizontal ? rectTable.get(d).height : rectTable.get(d).width;
    };

    // A surface gap and a per-segment divider stroke are two ways to separate
    // adjacent fills; P7 uses the gap, so when it is active the gap takes over
    // and the divider stroke is dropped (pass `segmentGap: 0` to keep a stroke
    // instead). The highlight *selection* stroke below is unaffected.
    const dividerStroke = gap > 0 ? 'none' : config.stroke || 'none';
    const dividerStrokeWidth = gap > 0 ? 0 : config.strokeWidth || 0;

    const rects = segmentGroups
        .append('rect')
        .attr('class', (d) => {
            const field = getField(d);
            const appearance = getAppearance(d);
            // Competency segments emit the level's own slugified name as a selector
            // hook (paint comes from --ks-band-color below); other fields (gender,
            // richtig/falsch) keep their raw field as the token.
            const classToken = appearance ? getCompetencyLevelClassToken(null, appearance) : field;
            const highlightClass = config.highlightedKey === field ? ' highlighted' : '';
            const competencyClass = appearance ? ' competency-level' : '';
            return `bar-segment${competencyClass} level-${classToken}${highlightClass}`;
        })
        .attr('data-field', (d) => getField(d))
        .attr('data-level', (d) => getField(d))
        .attr('data-value', (d) => d.value)
        .attr('x', (d) => (isHorizontal ? insetPos(stackPos(d), stackSize(d)) : crossPos(d)))
        .attr('y', (d) => (isHorizontal ? crossPos(d) : insetPos(stackPos(d), stackSize(d))))
        .attr('width', (d) => (isHorizontal ? insetSize(stackSize(d)) : crossSize(d)))
        .attr('height', (d) => (isHorizontal ? crossSize(d) : insetSize(stackSize(d))))
        .style('--ks-band-color', (d) => getAppearance(d)?.baseColor ?? null)
        .attr('fill', (d) => (isCompetencySegment(d) ? null : (d.color ?? null)))
        .attr('fill-opacity', (d) => (isCompetencySegment(d) ? null : (config.fillOpacity ?? null)))
        .attr('stroke', (d) =>
            config.highlightedKey === getField(d)
                ? getThemeColors().chrome.chartLabelFill
                : dividerStroke,
        )
        .attr('stroke-width', (d) =>
            config.highlightedKey === getField(d) ? 3 : dividerStrokeWidth,
        );

    const { cursor } = config;
    rects.style('cursor', (d) => {
        if (typeof cursor === 'function') {
            return cursor(d, config.context);
        }
        return cursor || (config.onClick ? 'pointer' : 'default');
    });

    // Add labels if configured
    if (config.showLabels) {
        const minSize = config.minLabelWidth || config.minWidthForLabel || 30;

        segmentGroups.each(function (d) {
            const group = d3.select(this);
            const rect = group.select('rect');
            const rectWidth = parseFloat(rect.attr('width'));
            const rectHeight = parseFloat(rect.attr('height'));
            const segmentSize = isHorizontal ? rectWidth : rectHeight;

            if (segmentSize > minSize) {
                const labelX = parseFloat(rect.attr('x')) + rectWidth / 2;
                const labelY = parseFloat(rect.attr('y')) + rectHeight / 2;
                const appearance = getAppearance(d);

                const label = group
                    .append('text')
                    .attr('class', 'bar-label')
                    .attr('x', labelX)
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .style('font-weight', config.labelFontWeight ?? '')
                    // A band's label takes the band's own ink.
                    .style('fill', appearance?.ink ?? config.labelColor ?? '')
                    .style('pointer-events', 'none')
                    .text(String(config.labelFormatter?.(d, { withShare: true }) ?? ''));

                // Three tiers, measured: the long form (`A2 · 32 %`) on one line when
                // it fits the segment with a little air; in a vertical bar tall enough
                // for two lines, level over share; otherwise the formatter's short
                // form. A formatter that ignores the tier returns the same text twice.
                const labelNode = /** @type {SVGTextContentElement} */ (label.node());
                const fitWidth = rectWidth - 2 * LABEL_FIT_PAD;
                const measure = () =>
                    typeof labelNode?.getComputedTextLength === 'function'
                        ? labelNode.getComputedTextLength()
                        : 0;
                if (measure() > fitWidth) {
                    const lines = config.labelFormatter?.(d, { withShare: true, lines: true });
                    const lineHeight = parseFloat(getComputedStyle(labelNode).fontSize) * 1.2;
                    const stacked =
                        !isHorizontal &&
                        Array.isArray(lines) &&
                        lines.length === 2 &&
                        rectHeight >= lineHeight * 2 + 2 * LABEL_FIT_PAD;
                    if (stacked) {
                        label.text(null);
                        lines.forEach((line, i) => {
                            label
                                .append('tspan')
                                .attr('x', labelX)
                                .attr('dy', i === 0 ? `${-lineHeight / 2}px` : `${lineHeight}px`)
                                .text(line);
                        });
                    }
                    if (!stacked || measure() > fitWidth) {
                        label.text(String(config.labelFormatter?.(d, { withShare: false }) ?? ''));
                    }
                }
            }
        });
    }

    if (config.getTooltipContent && !chartInstance) {
        throw new Error(
            '[createSVGStackedBar] chartInstance is required when getTooltipContent is provided.',
        );
    }

    // Add interactions - use wireTooltipEvents when tooltip content is provided.
    if (chartInstance && config.getTooltipContent) {
        // Modern approach: use unified wireTooltipEvents
        chartInstance.wireTooltipEvents(rects, {
            getTooltipContent: (d) => config.getTooltipContent?.(d, config.context) ?? '',
            context: config.context,
            tooltipId: config.tooltipId || 'stacked-bar',
            hoverEffect: config.hoverEffect || getDefaultHoverEffect(),
            onClick: config.onClick
                ? (d, event, element) => config.onClick?.(event, d, element, config.context)
                : undefined,
            // `null`, not `undefined`, for a per-datum cursor: the rects above already
            // carry what the function returned, and wireTooltipEvents' own default
            // (`onClick ? 'pointer' : null`) fires on `undefined` — it would repaint
            // every segment 'pointer' and lose the per-segment answer.
            cursor: typeof cursor === 'string' ? cursor : null,
        });

        // Additional hover/leave callbacks if provided
        if (config.onHover) {
            rects.on('mouseenter.extra', function (event, d) {
                config.onHover?.(d, event, this, config.context);
            });
        }
        if (config.onLeave) {
            rects.on('mouseleave.extra', function (event, d) {
                config.onLeave?.(d, event, this, config.context);
            });
        }
    } else {
        // No tooltip content: attach only hover/click callbacks.
        rects.on('mouseenter', function (event, d) {
            if (config.onHover) {
                config.onHover(d, event, this, config.context);
            }
        });

        rects.on('mouseleave', function (event, d) {
            if (config.onLeave) {
                config.onLeave(d, event, this, config.context);
            }
        });

        if (config.onClick) {
            rects.on('click', function (event, d) {
                config.onClick?.(event, d, this, config.context);
            });
        }
    }

    return barGroup;
}

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================

/**
 * Shared chart configuration defaults for stacked bar charts
 */
export const STACKED_BAR_CHART_DEFAULTS = {
    THRESHOLDS: {
        MIN_LABEL_SIZE_EM: 1.2,
    },
    STYLES: {
        FILL_OPACITY_DEFAULT: 1,
        FILL_OPACITY_HOVER: DEFAULT_CHART_HOVER_OPACITY,
    },
};

// ============================================================================
// CHART-SPECIFIC HELPERS
// ============================================================================

/**
 * Creates a stacked bar for D3 charts using the existing chart data format.
 * Converts stackedEntry format to segments and delegates to createSVGStackedBar.
 * @param {D3Selection} g - D3 selection
 * @param {object} data - Data object for the bar
 * @param {object} stackedEntry - Stacked data with _start/_end/_value keys per level
 * @param {string[]} levels - Array of level keys
 * @param {function(string): string} getColorForLevel - Level → color mapping
 * @param {BarScales} scales - { xScale, yScale }
 * @param {ChartStackedBarOptions} options - Configuration options
 * @param {ChartRenderer|null} [chartInstance] - Optional chart instance for wireTooltipEvents
 * @returns {*} The created bar selection, as `createSVGStackedBar` returned it.
 */
export function createChartStackedBar(
    g,
    data,
    stackedEntry,
    levels,
    getColorForLevel,
    scales,
    options = {},
    chartInstance = null,
) {
    chartInstance = chartInstance || options.chartInstance || null;
    const { yScale } = scales;

    // Convert stackedEntry format to standard segments
    const segments = buildStackedSegments(stackedEntry, levels, getColorForLevel, {
        valueKey: '_value',
    }).filter((seg) => seg.value > 0);

    // Build config for createSVGStackedBar
    const barSize = options.barWidth || scales.xScale?.bandwidth?.() || 40;
    const context = {
        data,
        stackedEntry,
        levels,
        ...options.context,
    };

    // Remap getTooltipContent signature: chart stacked bars pass (data, stackedEntry, level, context)
    /** @type {StackedBarConfig['getTooltipContent']} */
    let getTooltipContent = null;
    if (options.getTooltipContent) {
        const originalGetTooltipContent = options.getTooltipContent;
        getTooltipContent = (segment) =>
            originalGetTooltipContent(data, stackedEntry, segment.field, context);
    }

    // Remap onClick signature
    /** @type {StackedBarConfig['onClick']} */
    let onClick = null;
    if (options.onClick) {
        const originalOnClick = options.onClick;
        onClick = (event, d, element, ctx) => originalOnClick(event, data, d.field, ctx);
    }

    const cursorOption = options.cursor;

    // Build barGroup wrapper with positioning
    const barGroup = g
        .append('g')
        .attr('class', `bar-group ${data.type ? `${data.type}-bar` : ''}`)
        .attr('transform', `translate(${options.xPosition || 0}, 0)`)
        .datum(data);

    // Delegate to createSVGStackedBar
    createSVGStackedBar(
        barGroup,
        segments,
        {
            orientation: 'vertical',
            barSize: barSize,
            barGroupClass: options.barGroupClass || 'stacked-bar-inner',
            context: context,
            fillOpacity: options.fillOpacity ?? 0.9,
            stroke: options.stroke ?? 'none',
            strokeWidth: options.strokeWidth ?? 0,
            cursor:
                typeof cursorOption === 'function'
                    ? (d) => cursorOption(d, data, context)
                    : cursorOption || 'default',
            getTooltipContent: getTooltipContent,
            tooltipId: options.tooltipId || 'stacked-bar',
            hoverEffect: options.hoverEffect || {
                enter: { 'fill-opacity': options.hoverOpacity ?? 1 },
                leave: { 'fill-opacity': options.fillOpacity ?? 0.9 },
            },
            onClick: onClick,
            highlightedKey: options.highlightedKey,
            showLabels: options.showLabels || false,
            minLabelWidth: options.minLabelWidth,
            labelFormatter: options.labelFormatter,
            labelColor: options.labelColor,
            labelFontWeight: options.labelFontWeight,
            // Pass through any extra hover/leave callbacks
            onHover: options.onHover
                ? (d, event, element, ctx) =>
                      options.onHover?.(event, data, stackedEntry, d.field, ctx)
                : null,
            onLeave: options.onLeave
                ? (d, event, element, ctx) => options.onLeave?.(event, data, d.field, ctx)
                : null,
            // For vertical charts, use yScale
            yScale: yScale,
            isHorizontal: false,
        },
        chartInstance,
    );

    // Add label if configured
    if (options.showLabel && options.labelText) {
        barGroup
            .append('text')
            .attr('class', (options.labelY ?? -5) < 0 ? 'domain-label' : 'bar-label')
            .attr('x', barSize / 2)
            .attr('y', options.labelY || -5)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', (options.labelY ?? -5) < 0 ? 'auto' : 'middle')
            .style('font-weight', options.labelFontWeight || 'bold')
            .style('font-family', options.fontFamily || 'inherit')
            .style('fill', options.labelColor || getThemeColors().chrome.textSecondary)
            .style('pointer-events', 'none')
            .text(options.labelText);
    }

    return barGroup;
}

/**
 * Creates multiple stacked bars for chart comparison views.
 * @param {D3Selection} g - D3 selection to append into.
 * @param {object[]} chartData - One entry per group, in draw order.
 * @param {object[]} stackedData - The stacked layout for those groups, with `_start`/`_end` per level.
 * @param {string[]} levels - Level keys, in stack order.
 * @param {function(string): string} getColorForLevel - Level to color mapping.
 * @param {BarScales} scales - The `xScale` and `yScale` the bars are drawn against.
 * @param {ChartStackedBarOptions} options - Bar geometry and interaction options.
 * @param {ChartRenderer|null} [chartInstance] - Optional chart instance for wireTooltipEvents (pass as last param or in options.chartInstance).
 * @returns {*} The created bar selections, one per group.
 */
export function createChartStackedBars(
    g,
    chartData,
    stackedData,
    levels,
    getColorForLevel,
    scales,
    options = {},
    chartInstance = null,
) {
    // Allow chartInstance to be passed in options for convenience
    chartInstance = chartInstance || options.chartInstance || null;
    const { xScale, yScale } = scales;

    const barsGroup = g.append('g').attr('class', 'stacked-bars-group');

    chartData.forEach((data, index) => {
        const xPosition = xScale(data.name || data.domain);

        createChartStackedBar(
            barsGroup,
            data,
            stackedData[index],
            levels,
            getColorForLevel,
            { xScale, yScale },
            {
                ...options,
                xPosition,
                barWidth: xScale.bandwidth(),
                context: {
                    ...options.context,
                    index,
                    chartData,
                },
            },
            chartInstance,
        );
    });

    return barsGroup;
}

// ============================================================================
// BARCHART RENDERER CLASS
// ============================================================================

/**
 * Base class for bar charts that need stacked bar functionality.
 * Extends ChartRenderer with SVG stacked bar specific methods and presets.
 */
export class BarChartRenderer extends ChartRenderer {
    constructor(containerId, options = {}) {
        super(containerId, options);
    }

    // ========================================================================
    // SHARED HIGHLIGHT HELPERS (used by KS distribution + simple KS bar)
    // ========================================================================

    /**
     * Resolve the next highlighted key for a click-to-toggle interaction.
     * Clicking the already-active key clears the highlight.
     * @param {string|null} currentKey - Currently highlighted key
     * @param {string} clickedKey - Key of the clicked segment
     * @returns {string|null} Next highlighted key
     */
    toggleHighlightKey(currentKey, clickedKey) {
        return currentKey === clickedKey ? null : clickedKey;
    }

    /**
     * Apply the shared highlight stroke treatment to a selection of bar-segment
     * rects. Highlighted segments get a thick label-fill outline; others fall back
     * to no stroke — the P7 surface gap provides segment separation.
     * @param {D3Selection} selection - D3 selection of segment rects
     * @param {boolean} isHighlighted - Whether the selection is the highlighted level
     */
    applyHighlightStroke(selection, isHighlighted) {
        const colors = getThemeColors();
        selection
            .attr('stroke', isHighlighted ? colors.chrome.chartLabelFill : 'none')
            .attr('stroke-width', isHighlighted ? 3 : 0)
            .classed('highlighted', isHighlighted);
    }
}
