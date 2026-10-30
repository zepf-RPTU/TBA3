/**
 * The axis standard every chart draws with:
 * - no tick marks; labels sit `AXIS_DEFAULTS.tickPaddingPx` off the plot edge, the same
 *   distance `ChartRenderer.measureAxisSpace` reserves;
 * - a value axis (percent, rating) draws no line; gridlines at its ticks
 *   (`appendGridLines`) carry the reading instead;
 * - a category axis keeps its baseline (`appendAxisGroup(…, { baseline: true })`, or
 *   `appendAxisBaseline` under hand-drawn labels);
 * - ink is CSS (chartRenderer.css): secondary text for tick labels, `--chart-axis-color`
 *   for the baseline, primary text for the title, which keeps labels at WCAG 4.5:1 and
 *   the baseline at 3:1. Charts set no axis fills or strokes.
 */

import { AXIS_DEFAULTS } from './chartDefaults.js';
import * as d3 from 'd3';
import { formatDecimal, formatPercent } from '../utils/numberFormat.js';
import { selectOrAppend } from './selectOrAppend.js';

/** @typedef {import('./renderers/chartRenderer.js').ChartRenderer} ChartRenderer */
/** @typedef {'left'|'right'|'bottom'} AxisSide */
/** @typedef {d3.ScaleBand<string> | d3.ScalePoint<string>} CategoryScale */

/**
 * Text measurement overrides, as `ChartRenderer.measureTexts` takes them.
 * @typedef {object} TextMeasureOptions
 * @property {number} [fontSizePx]
 * @property {'sm'|'base'} [textSize] - Token-sized text override.
 * @property {number} [rotationDeg]
 * @property {string|number|null} [fontWeight]
 */

/**
 * Everything an axis measurement takes: the tick labels' size and rotation, their
 * formatter and the axis title.
 * @typedef {Pick<TextMeasureOptions, 'textSize'|'rotationDeg'> & {
 *   formatter?: (value: *) => string,
 *   axisTitleText?: string,
 * }} AxisMeasureOptions
 */

/**
 * @typedef {{ useHeight?: boolean }} EdgeReserveOptions
 */

/**
 * A chart layout, as a renderer's `layout` option: only what differs from the defaults
 * (no axis space, 4 px padding — the floor `ChartRenderer` applies).
 * @typedef {object} ChartLayout
 * @property {{[side: string]: number}} [padding]
 * @property {{min: number, max: number}} [aspectRange] - The width / height range the plot is held in.
 */

/** The percent steps an axis tries, finest first. */
const PERCENT_TICK_STEPS = [10, 20, 50];
/** Every tick label a 0…100 percent axis can draw: what its space is measured from. */
const PERCENT_MEASURE_TICKS = d3.range(0, 101, 10);

/**
 * Tick label for a percentage axis: whole percent, German.
 * @param {number|string} value
 * @returns {string} The tick, e.g. `40 %`.
 */
function formatPercentTick(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? formatPercent(numeric, 0) : `${value}`;
}

/**
 * Tick label for a rating axis, fixed to one decimal.
 * @param {number|string} value
 * @returns {string} Unchanged when not numeric.
 */
function formatRatingTick(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? formatDecimal(numericValue, 1) : String(value);
}

/**
 * The tick values of a percent axis: every 10 %, or every 20 % (then 50 %) when the
 * axis is too short for 10 % ticks to stay `AXIS_DEFAULTS.minTickSpacingPx` apart.
 * @param {d3.ScaleContinuousNumeric<number, number>} scale - Domain in percent.
 * @param {AxisSide} side
 * @returns {number[]} Ascending, on multiples of the step.
 */
export function percentTickValues(scale, side) {
    const [d0, d1] = /** @type {[number, number]} */ (d3.extent(scale.domain()));
    const [r0, r1] = scale.range();
    const step = percentTickStep(d1 - d0, Math.abs(r1 - r0), side);
    return d3.range(Math.ceil(d0 / step) * step, d1 + step / 1000, step);
}

/**
 * The tick step a percent axis spanning `spanPercent` over `lengthPx` draws.
 * @param {number} spanPercent - The domain's extent.
 * @param {number} lengthPx - The axis length.
 * @param {AxisSide} side
 * @returns {number} In percent.
 */
function percentTickStep(spanPercent, lengthPx, side) {
    const pxPerPercent = lengthPx / Math.max(1e-9, spanPercent);
    const vertical = side === 'left' || side === 'right';
    const minSpacing = AXIS_DEFAULTS.minTickSpacingPx[vertical ? 'vertical' : 'horizontal'];
    return (
        PERCENT_TICK_STEPS.find((candidate) => candidate * pxPerPercent >= minSpacing) ??
        PERCENT_TICK_STEPS[PERCENT_TICK_STEPS.length - 1]
    );
}

/**
 * The top of a 0-based percent axis showing values up to `valuePercent`: the lowest
 * multiple of the finest tick step that is itself a tick `percentTickValues` draws at
 * that length, so the top is always labelled. The step depends on the top and the steps
 * do not divide one another (20 and 50), so rounding up to one step can land off the
 * next; the search walks up instead and ends by 100, a multiple of every step. 100 when
 * there is nothing to show, since a [0, 0] domain collapses the axis to one tick.
 * @param {number} valuePercent - The largest value the axis must show.
 * @param {number} lengthPx - The axis length.
 * @param {AxisSide} side
 * @returns {number}
 */
export function percentAxisMax(valuePercent, lengthPx, side) {
    if (!(valuePercent > 0)) return 100;
    const finest = PERCENT_TICK_STEPS[0];
    let top = Math.ceil(valuePercent / finest) * finest;
    while (top % percentTickStep(top, lengthPx, side) !== 0) top += finest;
    return top;
}

/**
 * The d3 axis generator matching an edge, with the shared tick geometry: no tick marks,
 * labels `AXIS_DEFAULTS.tickPaddingPx` off the plot edge.
 * @template {d3.AxisDomain} Domain
 * @param {AxisSide} side
 * @param {d3.AxisScale<Domain>} scale
 * @returns {d3.Axis<Domain>}
 */
function axisForSide(side, scale) {
    const axis =
        side === 'right'
            ? d3.axisRight(scale)
            : side === 'bottom'
              ? d3.axisBottom(scale)
              : d3.axisLeft(scale);
    return axis.tickSize(0).tickPadding(AXIS_DEFAULTS.tickPaddingPx);
}

/**
 * @param {AxisSide} side
 * @param {d3.ScaleContinuousNumeric<number, number>} scale - Domain in percent.
 * @param {{ tickValues?: number[] }} [options] - Explicit ticks; by default `percentTickValues`.
 * @returns {d3.Axis<number>}
 */
export function createPercentAxis(side, scale, options = {}) {
    return axisForSide(side, /** @type {d3.AxisScale<number>} */ (scale))
        .tickFormat(formatPercentTick)
        .tickValues(options.tickValues ?? percentTickValues(scale, side));
}

/**
 * A rating axis's ticks: every whole scale point of its domain.
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
function ratingTickValues(min, max) {
    return d3.range(Math.ceil(min), Math.floor(max) + 1);
}

/**
 * A rating axis, ticked as `ratingTickValues`.
 * @param {AxisSide} side
 * @param {d3.ScaleContinuousNumeric<number, number>} scale
 * @returns {d3.Axis<number>}
 */
export function createRatingAxis(side, scale) {
    const [d0, d1] = /** @type {[number, number]} */ (d3.extent(scale.domain()));
    return axisForSide(side, /** @type {d3.AxisScale<number>} */ (scale))
        .tickFormat(formatRatingTick)
        .tickValues(ratingTickValues(d0, d1));
}

/**
 * Build a category axis over a band or point scale.
 * @param {AxisSide} side
 * @param {CategoryScale} scale
 * @returns {d3.Axis<string>}
 */
export function createCategoryAxis(side, scale) {
    return axisForSide(side, scale);
}

/**
 * The group an axis is drawn into, carrying the classes chartRenderer.css styles axes
 * by: the one of `parent` classed `className` from the last draw, or a new one. A value
 * axis hides its line; `baseline` keeps it, for a category axis. A d3 axis called on the
 * reused group joins its ticks to the new ones.
 *
 * One class names one side across draws: d3 writes a tick label's `dy` and the group's
 * `text-anchor` only when they enter, so a group that changed side would keep the old
 * side's. A chart whose axes swap sides (an orientation toggle) gives each side its own class.
 * @template {SVGElement} P
 * @template D
 * @param {d3.Selection<P, D, any, any>} parent - The plot group.
 * @param {string} className - The chart's own class for the group (`x-axis`, `y-axis`, …), unique among `parent`'s children.
 * @param {{ baseline?: boolean }} [options] - Keep the axis line.
 * @returns {d3.Selection<SVGGElement, D, P, any>}
 */
export function appendAxisGroup(parent, className, { baseline = false } = {}) {
    return selectOrAppend(parent, 'g', className).attr(
        'class',
        axisGroupClass(className, { baseline }),
    );
}

/**
 * The `class` of an axis group (see `appendAxisGroup`), for a chart that joins its axis
 * groups itself.
 * @param {string} className - The chart's own class for the group.
 * @param {{ baseline?: boolean }} [options] - Keep the axis line.
 * @returns {string}
 */
export function axisGroupClass(className, { baseline = false } = {}) {
    return `chart-axis${baseline ? '' : ' chart-axis--no-line'} ${className}`;
}

/**
 * The line a d3 category axis would draw, for charts that place their own category
 * labels. Reuses the last draw's line (see `drawLine`).
 * @template {SVGElement} P
 * @template D
 * @param {d3.Selection<P, D, any, any>} parent
 * @param {{ x1: number, x2: number, y?: number }} geometry - The horizontal extent, at `y`.
 * @param {{ className?: string }} [options] - The chart's own class for the line, which tells two baselines of one parent apart.
 * @returns {d3.Selection<SVGLineElement, D, P, any>}
 */
export function appendAxisBaseline(parent, { x1, x2, y = 0 }, { className } = {}) {
    return drawLine(parent, `axis-baseline${className ? ` ${className}` : ''}`, {
        x1,
        x2,
        y1: y,
        y2: y,
    });
}

/**
 * A classed `<line>` between two points: the child of `parent` carrying exactly these
 * classes from the last draw, moved there, or a new one appended. One line per class
 * set and parent; a chart drawing two of one kind tells them apart by its own class.
 * @template {SVGElement} P
 * @template D
 * @param {d3.Selection<P, D, any, any>} parent
 * @param {string} className - Its whole class attribute.
 * @param {{x1: number, x2: number, y1: number, y2: number}} points
 * @returns {d3.Selection<SVGLineElement, D, P, any>}
 */
function drawLine(parent, className, { x1, x2, y1, y2 }) {
    /** @type {d3.Selection<SVGLineElement, D, P, any>} */
    const drawn = parent.selectChild(
        (child) => child instanceof SVGLineElement && child.getAttribute('class') === className,
    );
    const line = drawn.empty() ? parent.append('line').attr('class', className) : drawn;
    return line.attr('x1', x1).attr('x2', x2).attr('y1', y1).attr('y2', y2);
}

/**
 * The class each reference-line variant is styled by in chartRenderer.css: `reference`
 * a dashed guide in the axis ink (an average, a group boundary), `accent` a heavier
 * dashed guide whose colour the caller sets inline, `separator` a solid rule.
 * @type {Readonly<{reference: string, accent: string, separator: string}>}
 */
export const REFERENCE_LINE_CLASS = Object.freeze({
    reference: 'chart-reference-line',
    accent: 'chart-reference-line chart-reference-line--accent',
    separator: 'chart-separator',
});

/**
 * A reference line: geometry and class only, its look is CSS. Reuses the last draw's
 * line (see `drawLine`).
 * @template {SVGElement} P
 * @template D
 * @param {d3.Selection<P, D, any, any>} parent
 * @param {{ x1: number, x2: number, y1: number, y2: number }} geometry
 * @param {string} className - The chart's own class for the line.
 * @returns {d3.Selection<SVGLineElement, D, P, any>}
 */
export function appendReferenceLine(parent, { x1, x2, y1, y2 }, className) {
    return drawLine(parent, `${REFERENCE_LINE_CLASS.reference} ${className}`, { x1, x2, y1, y2 });
}

/** The `dy` a d3 bottom axis gives its tick text, down to the baseline. */
const D3_BOTTOM_TICK_DY_EM = 0.71;

/**
 * Baseline of a hand-placed category label's first line below the axis: where a d3
 * bottom axis sets its tick text (`tickPaddingPx`, then `D3_BOTTOM_TICK_DY_EM`).
 * @param {ChartRenderer} chart - The renderer, for the label font size.
 * @returns {number} Offset below the axis line in px.
 */
export function categoryLabelBaseline(chart) {
    return AXIS_DEFAULTS.tickPaddingPx + D3_BOTTOM_TICK_DY_EM * chart.resolveChartTextSize('base');
}

/**
 * Draw gridlines across the plot at a value axis's ticks, so grid and labels cannot
 * disagree: into `parent`'s grid group from the last draw, or a new one. Draw it before
 * the marks the first time: the grid sits behind them, and keeps that place after.
 * A grid whose axis moved to another side starts its lines afresh, as d3 sets a tick
 * line's `x2` or `y2` by side and would leave the other one standing.
 * @template {SVGElement} P
 * @template D
 * @param {d3.Selection<P, D, any, any>} parent - The plot group; it holds one grid.
 * @param {AxisSide} side - The edge the value axis sits on.
 * @param {d3.Axis<number>} axis - The value axis the grid follows (from `createPercentAxis` / `createRatingAxis`).
 * @param {number} lengthPx - How far the lines run across the plot.
 * @returns {d3.Selection<SVGGElement, D, P, any>}
 */
export function appendGridLines(parent, side, axis, lengthPx) {
    const group = selectOrAppend(parent, 'g', 'grid');
    if (group.attr('data-side') !== side) group.selectChildren().remove();
    callGridLines(group.attr('data-side', side), side, axis, lengthPx);
    return group;
}

/**
 * A percentage axis with its gridlines (see `appendGridLines` for the draw order): the
 * `y-axis` group on the left or right, the `x-axis` group at the bottom.
 * @template {SVGElement} P
 * @template D
 * @param {d3.Selection<P, D, any, any>} parent - The plot group.
 * @param {AxisSide} side
 * @param {d3.ScaleContinuousNumeric<number, number>} scale - Domain in percent.
 * @param {number} lengthPx - How far the gridlines run across the plot.
 * @returns {d3.Selection<SVGGElement, D, P, any>} The axis group, for the caller to place.
 */
export function appendPercentAxis(parent, side, scale, lengthPx) {
    const axis = createPercentAxis(side, scale);
    appendGridLines(parent, side, axis, lengthPx);
    const className = side === 'left' || side === 'right' ? 'y-axis' : 'x-axis';
    return appendAxisGroup(parent, className).call(axis);
}

/**
 * Draw or move gridlines in an existing grid group. Given a transition, d3's axis joins
 * the lines to the new ticks and slides them with it, so a grid redrawn beside an
 * animated axis moves in step with its labels.
 * @param {d3.Selection<any, any, any, any>|d3.Transition<any, any, any, any>} target - The grid group, or a transition on it, as whatever element and datum the caller selected it with.
 * @param {AxisSide} side - The edge the value axis sits on.
 * @param {d3.Axis<number>} axis - The value axis the grid follows (from `createPercentAxis` / `createRatingAxis`).
 * @param {number} lengthPx - How far the lines run across the plot.
 */
export function callGridLines(target, side, axis, lengthPx) {
    const grid = axisForSide(side, axis.scale())
        .tickValues(/** @type {number[]} */ (axis.tickValues()))
        .tickSize(side === 'left' ? -lengthPx : lengthPx)
        .tickFormat(() => '');
    grid(target);
    // Both a selection and a transition answer `selection()` with the group itself.
    const group = target.selection();
    group.select('.domain').remove();
    group.selectAll('text').remove();
}

/**
 * Space a percentage axis needs, measured from the widest label it can draw.
 * @param {ChartRenderer} chart
 * @param {AxisSide} side
 * @param {AxisMeasureOptions} [options]
 * @returns {number} In px.
 */
export function measurePercentAxisSpace(chart, side, options = {}) {
    return chart.measureAxisSpace(side, PERCENT_MEASURE_TICKS, {
        ...options,
        formatter: formatPercentTick,
    });
}

/**
 * Space a rating axis needs, measured with its real tick labels.
 * @param {ChartRenderer} chart
 * @param {AxisSide} side
 * @param {AxisMeasureOptions & { min: number, max: number }} options - `min`/`max`: the scale's domain.
 * @returns {number} In px.
 */
export function measureRatingAxisSpace(chart, side, options) {
    const { min, max, ...measureOptions } = options;
    return chart.measureAxisSpace(side, ratingTickValues(min, max), {
        ...measureOptions,
        formatter: formatRatingTick,
    });
}

/**
 * Room to reserve so the outermost tick label is not clipped by the plot edge.
 * Half the label overhangs the tick it sits on, so half its extent is what has to be kept free.
 * @param {ChartRenderer} chart
 * @param {string[]} labels - The labels that could sit at the edge.
 * @param {EdgeReserveOptions} [options] - `useHeight` to reserve vertically.
 * @returns {number} In px.
 */
function measureEdgeTickReserve(chart, labels, options = {}) {
    const measured = chart.measureTexts(labels);
    return (
        Math.ceil((options.useHeight ? measured.maxHeight : measured.maxWidth) / 2) +
        AXIS_DEFAULTS.edgeTickBufferPx
    );
}

/**
 * Edge reserve for the `100 %` label at the far end of a percentage axis: horizontal by
 * default, vertical with `useHeight`.
 * @param {ChartRenderer} chart
 * @param {EdgeReserveOptions} [options] - `useHeight` to reserve vertically.
 * @returns {number} In px.
 */
export function measurePercentEdgeTickReserve(chart, options = {}) {
    return measureEdgeTickReserve(chart, [formatPercentTick(100)], options);
}

/**
 * Edge reserve for the last label at the far end of a horizontal rating axis.
 * @param {ChartRenderer} chart
 * @param {number} max - The axis's top rating.
 * @returns {number} In px.
 */
export function measureRatingEdgeTickReserve(chart, max) {
    return measureEdgeTickReserve(chart, [formatRatingTick(max)]);
}
