/**
 * The D3 stacked-bar builder (`createSVGStackedBar`) the stacked-bar charts draw with.
 * Bars stack horizontally or vertically, and each bar wires its own segment tooltips
 * (`tooltip`).
 */

import { applyCompetenceBandPaint } from '../../services/competenceLevelPaint.js';
import { computeStackedBarRects } from '../../utils/stackedBarUtils.js';
import * as d3 from 'd3';
import {
    appendValueLabel,
    fitValueLabel,
    setValueLabelText,
    styleValueLabels,
} from '../chartValueLabels.js';
import { valueLabelInk } from '../../services/paletteTokens.js';
import { animate, fadeOutAndRemove, takeBack } from '../motionPreference.js';
import { selectOrAppend } from '../selectOrAppend.js';
import { DATA_MARK_CLASS } from '../../services/dataMark.js';

/** The transition a bar's segments and labels move and leave in. */
const BAR_TRANSITION = 'stacked-bar';

/** The transition a redraw moves, brings back and retires whole bars (`joinStackedBarRows`) in. */
const ROW_TRANSITION = 'stacked-bar-row';

/** @typedef {import('./chartRenderer.js').ChartRenderer} ChartRenderer */

/** @typedef {import('../../utils/stackedBarUtils.js').StackedSegment} StackedSegment */
/** @typedef {import('./internal/chartInteractionUtils.js').ChartCallbackContext} ChartCallbackContext */
/** @typedef {import('../../services/cursorTooltip.js').TooltipContent} TooltipContent */

/**
 * `createSVGStackedBar` options.
 * @template {StackedSegment} [TSegment=StackedSegment]
 * @typedef {object} StackedBarConfig
 * @property {boolean} [isHorizontal] - Stack horizontally; vertical otherwise.
 * @property {number} barSizePx - Bar thickness along the cross axis.
 * @property {*} [xScale] - Percent → px along x; required for a horizontal bar.
 * @property {*} [yScale] - Percent → px along y; required for a vertical bar.
 * @property {string} [barGroupClass] - Class of the wrapping `<g>`.
 * @property {ChartCallbackContext} [context] - The bar's context, handed to its tooltip as `bar`.
 * @property {string[]} [highlightedKeys] - Level keys drawn with the highlight stroke.
 * @property {string[]} [pressedKeys] - Level keys whose click toggle is on, read as `aria-pressed`; `highlightedKeys` by default, for a bar that toggles the highlight but draws none.
 * @property {boolean} [showLabels] - Draw a value label inside each segment one of its tiers fits; needs `labelFormatter`.
 * @property {SegmentLabelFormatter<TSegment>} [labelFormatter] - Label text per segment, tiered.
 * @property {StackedBarTooltip<TSegment>} [tooltip] - The segments' tooltip and click; none leaves them inert.
 * @property {number} [durationMs] - How long a redraw moves the kept segments (`ChartRenderer.drawDurationMs`); 0 by default.
 */

/**
 * A stacked bar's segment tooltip, wired through the chart's `wireTooltipEvents`.
 * @template {StackedSegment} [TSegment=StackedSegment]
 * @typedef {object} StackedBarTooltip
 * @property {(d: TSegment, bar: any) => TooltipContent} getTooltipContent - Tooltip per segment, given its bar's context (`config.context`, the caller's own shape; null without one).
 * @property {((d: TSegment, event: Event, element: Element) => void)|null} [onClick] - Click handler (Enter and Space click too); it turns the cursor into a pointer.
 */

/**
 * A segment's label text per tier: asked for the `withShare` form first, then for its
 * `lines`, then for the short form (see `levelShareLabelFormatter`); the first form that
 * fits the segment is drawn. A formatter that ignores the tier returns one label thrice.
 * @template {StackedSegment} [TSegment=StackedSegment]
 * @typedef {(segment: TSegment, tier?: {withShare: boolean, lines?: boolean}) => string | string[]} SegmentLabelFormatter
 */

/**
 * Fit a segment's value label to its rect: the formatter's tiers, longest first, against
 * the box (see `fitValueLabel`).
 * @template {StackedSegment} TSegment
 * @param {ChartRenderer} chart
 * @param {SegmentLabelFormatter<TSegment>} formatter
 * @param {TSegment} segment
 * @param {{width: number, height: number}} box - Its rect, px.
 * @returns {string|string[]|null} Null when none fits.
 */
function fitSegmentLabel(chart, formatter, segment, box) {
    return fitValueLabel(
        chart,
        [
            formatter(segment, { withShare: true }),
            formatter(segment, { withShare: true, lines: true }),
            formatter(segment, { withShare: false }),
        ],
        box,
    );
}

/**
 * Join one bar group (`g.bar-group`) per row under `parent`, keyed, so a redraw moves the
 * bars already drawn: an entering bar appears in its place, a kept one (even one caught
 * leaving) moves there, and a leaving one fades out. `draw` then builds each row's bar
 * into its group (`createSVGStackedBar`), in row order.
 * @template TRow
 * @param {d3.Selection<SVGGElement, unknown, any, any>} parent - The layer the bar groups are children of.
 * @param {TRow[]} rows - In draw order.
 * @param {object} options
 * @param {(row: TRow) => string} options.key
 * @param {(row: TRow) => string} options.place - The bar group's `transform`.
 * @param {number} options.durationMs - How long the kept bars move.
 * @param {(bar: d3.Selection<SVGGElement, TRow, null, undefined>, row: TRow) => void} options.draw - Draws the row's bar into its group.
 * @returns {d3.Selection<SVGGElement, TRow, any, any>}
 */
export function joinStackedBarRows(parent, rows, { key, place, durationMs, draw }) {
    /** @type {d3.Selection<SVGGElement, TRow, any, any>} */
    const existing = parent.selectChildren('g.bar-group');
    return existing
        .data(rows, key)
        .join(
            (enter) => enter.append('g').attr('class', 'bar-group').attr('transform', place),
            (update) => {
                // A bar caught leaving stays, and takes the pointer and the keyboard again.
                takeBack(update, ROW_TRANSITION).style('opacity', null);
                animate(update, { durationMs, name: ROW_TRANSITION }).attr('transform', place);
                return update;
            },
            (exit) => fadeOutAndRemove(exit, ROW_TRANSITION, durationMs),
        )
        .order()
        .each(function (row) {
            draw(d3.select(this), row);
        });
}

/**
 * Draw a stacked bar into `g`, or bring the one drawn there last pass up to date: the
 * bar group (`barGroupClass`) is reused, its segments are joined by level (`field`), so
 * a segment keeps its node (and keyboard focus) across a redraw, and a segment that
 * stops showing leaves. With a `durationMs`, a kept segment and its label move to their
 * new place; an entering one appears where it belongs.
 * @template {StackedSegment} TSegment
 * @template {d3.BaseType} P
 * @template PD
 * @param {d3.Selection<P, PD, any, any>} g - The group the bar lives in; it holds one bar of `barGroupClass`.
 * @param {TSegment[]} segments - The bar's segments; those without a share are not drawn.
 * @param {StackedBarConfig<TSegment>} config
 * @param {ChartRenderer} chartInstance - The chart that measures the segment labels and wires the tooltips
 * @returns {d3.Selection<SVGGElement, PD, P, any>} The one bar group (`barGroupClass`).
 */
export function createSVGStackedBar(g, segments, config, chartInstance) {
    const isHorizontal = config.isHorizontal === true;
    const { xScale, yScale, barSizePx } = config;
    const durationMs = config.durationMs ?? 0;
    const barGroupClass = config.barGroupClass || 'stacked-bar-group';

    const barGroup = selectOrAppend(g, 'g', barGroupClass);

    const validSegments = segments.filter((s) => s.percentage > 0);
    // The segment builders resolved each competence band on its row's own ladder; a
    // segment without one (gender, rating) has none.
    const getAppearance = (/** @type {TSegment} */ d) => d.appearance ?? null;

    // Every path that positions stacked segments takes its rects from
    // `computeStackedBarRects`, so they agree to the pixel.
    /** @type {Map<string, {x: number, y: number, width: number, height: number}>} */
    const rectTable = new Map();
    computeStackedBarRects(validSegments, {
        positionScale: isHorizontal ? xScale : yScale,
        bandSizePx: barSizePx,
        isHorizontal,
    }).forEach((rect) => rectTable.set(rect.segment.field, rect));

    // Final rect geometry, shared by the rect attributes and the label pass. Read by
    // level, as an updated rect is bound to this pass's segment of its level.
    /** @type {(d: TSegment) => {x: number, y: number, width: number, height: number}} */
    const rectOf = (d) =>
        /** @type {{x: number, y: number, width: number, height: number}} */ (
            rectTable.get(d.field)
        );
    /** @type {(sel: any) => any} Position a rect, or a transition on one. */
    const placeRect = (sel) =>
        sel
            .attr('x', (/** @type {TSegment} */ d) => rectOf(d).x)
            .attr('y', (/** @type {TSegment} */ d) => rectOf(d).y)
            .attr('width', (/** @type {TSegment} */ d) => rectOf(d).width)
            .attr('height', (/** @type {TSegment} */ d) => rectOf(d).height);

    /** @type {d3.Selection<SVGGElement, TSegment, SVGGElement, PD>} */
    const existing = barGroup.selectChildren('g.bar-segment-group');
    const segmentGroups = existing
        .data(validSegments, (d) => d.field)
        .join(
            (enter) => {
                const entered = enter.append('g');
                placeRect(entered.append('rect'));
                return entered;
            },
            (update) => {
                // A segment caught leaving stays, and takes the pointer and the keyboard again.
                takeBack(update, BAR_TRANSITION).style('opacity', null);
                placeRect(
                    animate(update.selectChild('rect').interrupt(BAR_TRANSITION), {
                        durationMs,
                        name: BAR_TRANSITION,
                    }),
                );
                return update;
            },
            (exit) => fadeOutAndRemove(exit, BAR_TRANSITION, durationMs),
        )
        .attr('class', (d) => `bar-segment-group ${DATA_MARK_CLASS} segment-${d.field}`)
        .order();

    /** @type {d3.Selection<SVGRectElement, TSegment, SVGGElement, PD>} */
    const rects = segmentGroups.selectChild('rect');
    rects
        .attr('class', (d) => {
            const { field } = d;
            const appearance = getAppearance(d);
            // A competence segment's selector hook is its level's slugified name; other
            // fields (gender, richtig/falsch) keep their raw field.
            const classToken = appearance?.patternKey ?? field;
            const highlightClass = config.highlightedKeys?.includes(field) ? ' highlighted' : '';
            return `bar-segment level-${classToken}${highlightClass}`;
        })
        // A surface gap separates the fills, so no divider stroke. The highlight ring
        // is stacked-bar.css's `.bar-segment.highlighted`, which outranks these attributes.
        .attr('stroke', 'none')
        .attr('stroke-width', 0)
        // A segment whose click toggles its highlight is a toggle button: the ring is
        // its pressed state, and assistive tech hears it as one.
        .attr('aria-pressed', (d) => {
            const pressed = config.pressedKeys ?? config.highlightedKeys;
            return config.tooltip?.onClick && pressed ? String(pressed.includes(d.field)) : null;
        });
    paintBarSegments(rects, (d) => ({ appearance: getAppearance(d), color: d.color }));

    // A tooltip's click handler turns it into a pointer.
    rects.style('cursor', 'default');

    const formatter = config.labelFormatter;
    if (config.showLabels && formatter) {
        // Every segment gets its label, an empty and invisible one where none fits yet:
        // a later pass that makes the segment larger then shows it.
        segmentGroups.each(function (d) {
            const { x, y, width, height } = rectOf(d);
            const text = fitSegmentLabel(chartInstance, formatter, d, { width, height });
            const at = { x: x + width / 2, y: y + height / 2 };
            const fill = getAppearance(d)?.ink ?? valueLabelInk(d.color);
            const group = d3.select(/** @type {SVGGElement} */ (this));
            /** @type {d3.Selection<SVGTextElement, TSegment, any, any>} */
            let label = group.selectChild('text.value-label');
            if (label.empty()) {
                label = appendValueLabel(group, { ...at, text: text ?? '', fill });
            } else {
                // Its lines are written where the label is now and move with it.
                styleValueLabels(label, { fill });
                setValueLabelText(label, text ?? '');
                animate(label.interrupt(BAR_TRANSITION), { durationMs, name: BAR_TRANSITION })
                    .attr('x', at.x)
                    .attr('y', at.y);
                animate(label.selectAll('tspan'), { durationMs, name: BAR_TRANSITION }).attr(
                    'x',
                    at.x,
                );
            }
            if (text === null) label.style('opacity', 0);
            else label.style('opacity', null);
        });
    } else {
        // A kept segment drops the label an earlier pass drew with labels on.
        segmentGroups.selectChild('text.value-label').remove();
    }

    if (config.tooltip) {
        const { getTooltipContent, onClick } = config.tooltip;
        const bar = config.context ?? null;
        chartInstance.wireTooltipEvents(rects, {
            getTooltipContent: (d) => getTooltipContent(d, bar),
            hoverEffect: 'area',
            onClick: onClick ?? undefined,
        });
    }

    return barGroup;
}

/**
 * Paint `.bar-segment` rects: a competence level through the band contract
 * (`applyCompetenceBandPaint` and the `competence-level` class, which stacked-bar.css
 * fills from), anything else through `fill`.
 * @template {SVGElement} E
 * @template D
 * @param {d3.Selection<E, D, any, any>} rects
 * @param {(d: D) => {appearance?: import('../../services/competenceLevelPaint.js').CompetenceAppearance|null, color?: string|null}} paintOf - Each rect's competence appearance, or its colour.
 * @returns {d3.Selection<E, D, any, any>} The same selection.
 */
export function paintBarSegments(rects, paintOf) {
    return rects.each(function (d) {
        const { appearance, color } = paintOf(d);
        const rect = d3.select(this).classed('competence-level', !!appearance);
        if (appearance) {
            applyCompetenceBandPaint(this, appearance);
            rect.style('fill', null);
        } else {
            rect.style('--competence-level-band-color', null)
                .style('--competence-level-band-ink', null)
                .style('fill', color ?? '');
        }
    });
}
