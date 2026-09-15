/**
 * Shared chart axis and layout helpers.
 *
 * These helpers standardize repeated axis/tick/layout policy without taking
 * ownership of chart-specific geometry.
 */

import {
    AXIS_DEFAULTS,
    AXIS_TICK_COUNTS,
    CHART_LAYOUT_PRESETS,
    PERCENT_TICK_VALUES,
    RATING_TICK_VALUES,
    TICK_PADDING,
} from './chartDefaults.js';
import * as d3 from 'd3';

/** @typedef {import('./renderers/chartRenderer.js').ChartRenderer} ChartRenderer */

/**
 * Tick selection for a percent or rating axis. `tickValues` wins, then a `step` (with
 * `min`/`max` for ratings), then a `ticks` count.
 * @typedef {object} AxisTickOptions
 * @property {number[]} [tickValues] - Explicit tick values.
 * @property {number} [step] - Tick spacing.
 * @property {number} [min] - Rating range start.
 * @property {number} [max] - Rating range end.
 * @property {number} [ticks] - Tick count hint.
 * @property {(value: *) => string} [formatter] - Tick label formatter.
 */

/**
 * Text measurement overrides, as `ChartRenderer.measureTexts` takes them.
 * @typedef {object} TextMeasureOptions
 * @property {number} [fontSize] - Font size in px.
 * @property {'sm'|'base'|'lg'} [textSize] - Token-sized text override.
 * @property {string} [fontFamily] - Font family.
 * @property {number} [rotation] - Rotation in degrees.
 * @property {string|number|null} [fontWeight] - Font weight.
 * @property {string|number} [dx] - Horizontal offset.
 * @property {string|number} [dy] - Vertical offset.
 */

/**
 * Everything an axis measurement takes: the tick selection, the text measurement
 * overrides and the axis title.
 * @typedef {AxisTickOptions & TextMeasureOptions & {
 *   tickPadding?: number,
 *   axisTitleGap?: number,
 *   axisTitleText?: string,
 *   axisTitleFontSize?: number,
 * }} AxisMeasureOptions
 */

/**
 * @typedef {TextMeasureOptions & { useHeight?: boolean, buffer?: number }} EdgeReserveOptions
 */

/**
 * A chart layout: legend entries plus per-side axis, axis-extra and padding maps.
 * @typedef {object} ChartLayout
 * @property {object[]} [legends] - Legend entries.
 * @property {{[side: string]: number}} [axis] - Space per side for the axis.
 * @property {{[side: string]: number}} [axisExtra] - Extra per-side space.
 * @property {{[side: string]: number}} [padding] - Per-side padding.
 */

/**
 * Tick label for a percentage axis.
 * @param {number|string} value - The tick value.
 * @returns {string} The value with a percent sign appended.
 */
export function formatPercentTick(value) {
    return `${value}%`;
}

/**
 * Tick label for a rating axis, fixed to one decimal.
 * @param {number|string} value - The tick value.
 * @returns {string} The value to one decimal, or the value unchanged when it is not numeric.
 */
function formatRatingTick(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(1) : String(value);
}

/**
 * Tick values across 0…100 at a given step.
 * @param {number} [step=20] - Distance between ticks; 10 and 20 are served from constants.
 * @returns {number[]} The tick values, ascending, including both 0 and 100.
 */
function getPercentTicks(step = 20) {
    if (step === 10) return [...PERCENT_TICK_VALUES.step10];
    if (step === 20) return [...PERCENT_TICK_VALUES.step20];

    const ticks = [];
    for (let value = 0; value <= 100; value += step) {
        ticks.push(value);
    }
    return ticks[ticks.length - 1] === 100 ? ticks : [...ticks, 100];
}

/**
 * Tick values across a rating range.
 * @param {number} [min=1] - Lowest tick.
 * @param {number} [max=5] - Highest tick.
 * @param {number} [step=1] - Distance between ticks.
 * @returns {number[]} The tick values, ascending; the 1…5 default is served from a constant.
 */
function getRatingTicks(min = 1, max = 5, step = 1) {
    if (min === 1 && max === 5 && step === 1) return [...RATING_TICK_VALUES.oneToFive];

    const ticks = [];
    for (let value = min; value <= max; value += step) {
        ticks.push(value);
    }
    return ticks;
}

/**
 * The d3 axis generator matching an edge.
 * @param {'left'|'right'|'top'|'bottom'} side - Which edge the axis sits on.
 * @param {d3.AxisScale<d3.AxisDomain>} scale - The d3 scale the axis reads its domain from.
 * @returns {object} A d3 axis for that edge, defaulting to a left axis for an unknown side.
 */
function axisForSide(side, scale) {
    if (side === 'right') return d3.axisRight(scale);
    if (side === 'top') return d3.axisTop(scale);
    if (side === 'bottom') return d3.axisBottom(scale);
    return d3.axisLeft(scale);
}

/**
 * Build a percentage axis with the shared tick formatting.
 * @param {'left'|'right'|'top'|'bottom'} side - Which edge the axis sits on.
 * @param {d3.AxisScale<d3.AxisDomain>} scale - The d3 scale the axis reads its domain from.
 * @param {AxisTickOptions} [options] - Explicit `tickValues`, a `step`, or a `ticks` count; plus a `formatter` override.
 * @returns {*} The configured d3 axis (typed loosely: d3's `transition.call(axis)` overload rejects `Axis`).
 */
export function createPercentAxis(side, scale, options = {}) {
    const axis = axisForSide(side, scale).tickFormat(options.formatter || formatPercentTick);

    if (options.tickValues) {
        axis.tickValues(options.tickValues);
    } else if (options.step) {
        axis.tickValues(getPercentTicks(options.step));
    } else {
        axis.ticks(options.ticks ?? AXIS_TICK_COUNTS.standard);
    }

    return axis;
}

/**
 * Build a rating axis with the shared tick formatting.
 * @param {'left'|'right'|'top'|'bottom'} side - Which edge the axis sits on.
 * @param {d3.AxisScale<d3.AxisDomain>} scale - The d3 scale the axis reads its domain from.
 * @param {AxisTickOptions} [options] - Explicit `tickValues`, a `min`/`max`/`step` range, or a `ticks` count; plus a `formatter` override.
 * @returns {*} The configured d3 axis.
 */
export function createRatingAxis(side, scale, options = {}) {
    const axis = axisForSide(side, scale).tickFormat(options.formatter || formatRatingTick);

    if (options.tickValues) {
        axis.tickValues(options.tickValues);
    } else if (options.step || options.min != null || options.max != null) {
        axis.tickValues(getRatingTicks(options.min ?? 1, options.max ?? 5, options.step ?? 1));
    } else {
        axis.ticks(options.ticks ?? AXIS_TICK_COUNTS.standard);
    }

    return axis;
}

/**
 * Space a percentage axis needs, measured with its real tick labels.
 * @param {ChartRenderer} chart - The renderer whose offscreen measurement is used.
 * @param {'left'|'right'|'top'|'bottom'} side - Which edge the axis sits on.
 * @param {AxisMeasureOptions} [options] - Tick and title options; the same ones `createPercentAxis` would use, so measurement and drawing agree.
 * @returns {number} Space needed in px.
 */
export function measurePercentAxisSpace(chart, side, options = {}) {
    const tickValues = options.tickValues || getPercentTicks(options.step ?? 20);
    return chart.measureAxisSpace(side, tickValues, {
        ...options,
        formatter: options.formatter || formatPercentTick,
        tickPadding: options.tickPadding ?? TICK_PADDING,
        axisTitleGap: options.axisTitleGap ?? AXIS_DEFAULTS.titleGap,
    });
}

/**
 * Space a rating axis needs, measured with its real tick labels.
 * @param {ChartRenderer} chart - The renderer whose offscreen measurement is used.
 * @param {'left'|'right'|'top'|'bottom'} side - Which edge the axis sits on.
 * @param {AxisMeasureOptions} [options] - Tick and title options; the same ones `createRatingAxis` would use, so measurement and drawing agree.
 * @returns {number} Space needed in px.
 */
export function measureRatingAxisSpace(chart, side, options = {}) {
    const tickValues =
        options.tickValues || getRatingTicks(options.min ?? 1, options.max ?? 5, options.step ?? 1);
    return chart.measureAxisSpace(side, tickValues, {
        ...options,
        formatter: options.formatter || formatRatingTick,
        tickPadding: options.tickPadding ?? TICK_PADDING,
        axisTitleGap: options.axisTitleGap ?? AXIS_DEFAULTS.titleGap,
    });
}

/**
 * Space a category axis needs, measured with its real labels.
 * @param {ChartRenderer} chart - The renderer whose offscreen measurement is used.
 * @param {'left'|'right'|'top'|'bottom'} side - Which edge the axis sits on.
 * @param {string[]} labels - The category labels to be drawn.
 * @param {AxisMeasureOptions} [options] - Tick and title options, plus a `formatter` override.
 * @returns {number} Space needed in px.
 */
export function measureCategoryAxisSpace(chart, side, labels, options = {}) {
    return chart.measureAxisSpace(side, labels || [], {
        ...options,
        formatter: options.formatter || ((value) => value),
        tickPadding: options.tickPadding ?? TICK_PADDING,
        axisTitleGap: options.axisTitleGap ?? AXIS_DEFAULTS.titleGap,
    });
}

/**
 * Room to reserve so the outermost tick label is not clipped by the plot edge.
 * Half the label overhangs the tick it sits on, so half its extent is what has to be kept free.
 * @param {ChartRenderer} chart - The renderer whose offscreen measurement is used.
 * @param {string[]} labels - The labels that could sit at the edge.
 * @param {EdgeReserveOptions} [options] - `useHeight` to reserve vertically, plus a `buffer` override.
 * @returns {number} Space to reserve in px.
 */
export function measureEdgeTickReserve(chart, labels, options = {}) {
    const measured = chart.measureTexts(labels || [], options);
    return (
        Math.ceil((options.useHeight ? measured.maxHeight : measured.maxWidth) / 2) +
        (options.buffer ?? AXIS_DEFAULTS.edgeTickBuffer)
    );
}

/**
 * Edge reserve for a percentage axis, measured from its widest tick label.
 * @param {ChartRenderer} chart - The renderer whose offscreen measurement is used.
 * @param {EdgeReserveOptions & { value?: number }} [options] - The `value` to measure (100 by default), plus the measurement overrides.
 * @returns {number} Space to reserve in px.
 */
export function measurePercentEdgeTickReserve(chart, options = {}) {
    const { value = 100, ...measureOptions } = options;
    return measureEdgeTickReserve(chart, [formatPercentTick(value)], measureOptions);
}

/**
 * Tick count for the available height — fewer ticks on a short chart, so labels stay readable.
 * @param {{ containerHeight?: number }} dimensions - Measured chart dimensions.
 * @param {{ height?: number, compactHeight?: number }} [options] - A `height` override, and the `compactHeight` threshold.
 * @returns {number} The tick count to request.
 */
export function getResponsiveTickCount(dimensions, options = {}) {
    const height = options.height ?? dimensions?.containerHeight ?? 0;
    return height < (options.compactHeight ?? 350)
        ? AXIS_TICK_COUNTS.compact
        : AXIS_TICK_COUNTS.dense;
}

/**
 * Shallow-copy legend entries so a merged layout never aliases its source.
 * @param {Array<object>} [entries] - Entries to copy.
 * @returns {Array<object>} A new array of new objects.
 */
function cloneLegendEntries(entries = []) {
    return entries.map((entry) => ({ ...entry }));
}

/**
 * Merge per-side values (left/right/top/bottom), overrides winning.
 * @param {{[side: string]: number}} [base] - Values from the preset.
 * @param {{[side: string]: number}} [overrides] - Values from the caller.
 * @returns {{[side: string]: number}} A new object; neither input is mutated.
 */
function mergeSideValues(base = {}, overrides = {}) {
    return { ...base, ...overrides };
}

/**
 * Merge two chart layouts, overrides winning.
 * Legends and the per-side maps are copied rather than aliased, so a preset cannot be
 * mutated through the layout a chart is handed.
 * @param {ChartLayout} [base] - The layout being extended, usually a preset.
 * @param {ChartLayout} [overrides] - Caller values that win over the base.
 * @returns {ChartLayout} A new layout; neither input is mutated.
 */
export function mergeChartLayout(base = {}, overrides = {}) {
    return {
        ...base,
        ...overrides,
        legends: overrides.legends
            ? cloneLegendEntries(overrides.legends)
            : cloneLegendEntries(base.legends),
        axis: mergeSideValues(base.axis, overrides.axis),
        axisExtra: mergeSideValues(base.axisExtra, overrides.axisExtra),
        padding: mergeSideValues(base.padding, overrides.padding),
    };
}

/**
 * A named chart layout preset, with overrides merged in.
 * @param {string} name - Preset key; an unknown name throws rather than silently laying out wrong.
 * @param {ChartLayout} [overrides] - Caller values that win over the preset.
 * @returns {ChartLayout} A new layout.
 */
export function chartLayoutPreset(name, overrides = {}) {
    const preset = CHART_LAYOUT_PRESETS[name];
    if (!preset) {
        throw new Error(`Unknown chart layout preset: ${name}`);
    }
    return mergeChartLayout(preset, overrides);
}
