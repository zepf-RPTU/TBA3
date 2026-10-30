/**
 * What the lollipop charts share: the keyed stem and head join, the item hit bands whose
 * hover grows both, the minimum item pitch, and the items by domain.
 */

import * as d3 from 'd3';
import { AVERAGE_MARKER, MARK_DEFAULTS } from '../chartDefaults.js';
import { MOTION_EASE, animate, leave, motionDuration, takeBack } from '../motionPreference.js';
import { HOVER_PRESETS, STEM_HOVER, setRestingSize } from './internal/chartInteractionUtils.js';
import { selectOrAppend } from '../selectOrAppend.js';
import './lollipopMarks.css';
import { asDataMark } from '../../services/dataMark.js';

/** @typedef {import('./chartRenderer.js').ChartRenderer} ChartRenderer */

/**
 * One keyed enter/update/exit join, shared by the stems and the heads, of the marks that
 * are `g`'s children. An entering mark rises from the baseline and fades in, a leaving
 * one fades out and drops back; the named 'lollipop' transition lets an update cancel a
 * pending exit `.remove()` when the same datum re-enters mid-flight.
 * @template TDatum
 * @template {import('d3').BaseType} P
 * @template PD
 * @param {import('d3').Selection<P, PD, any, any>} g
 * @param {TDatum[]} data - In draw order.
 * @param {(d: TDatum) => string} key
 * @param {string} className - Class the marks are joined on.
 * @param {string} tag
 * @param {number} durationMs - `0` (or reduced motion) applies the change instantly.
 * @param {object} attrs - Attribute setters, each taking a selection or a transition (typed
 *   `any`: d3's `attr` overloads on a selection-or-transition union resolve to nothing).
 * @param {(sel: any) => any} attrs.size - The size and the baseline end, which follow the layout; set on enter and update.
 * @param {(sel: any) => any} attrs.fixed - Set once on enter: constants of the mark.
 * @param {(sel: any) => any} attrs.paint - The colour; set on the joined marks, never in a transition, since a `var()` token does not tween.
 * @param {(sel: any) => any} attrs.position - The position; set on enter and update.
 * @param {(sel: any) => any} attrs.value - The value coordinate the mark animates to.
 * @param {(sel: any) => any} attrs.baseline - The value coordinate at the axis, where marks enter from and exit to.
 * @returns {import('d3').Selection<any, TDatum, P, PD>} The element is `tag`'s.
 */
function joinMarks(
    g,
    data,
    key,
    className,
    tag,
    durationMs,
    { size, fixed, paint, position, value, baseline },
) {
    // Every child the class matches is a mark this join made, bound to a datum.
    return /** @type {import('d3').Selection<any, TDatum, P, PD>} */ (
        g.selectChildren(`.${className}`)
    )
        .data(data, key)
        .join(
            (enter) =>
                baseline(position(fixed(size(enter.append(tag).attr('class', className)))))
                    .attr('opacity', 0)
                    .call((/** @type {import('d3').Selection<any, TDatum, any, any>} */ entered) =>
                        value(animate(entered, { durationMs, name: 'lollipop' })).attr(
                            'opacity',
                            1,
                        ),
                    ),
            (update) =>
                update.call((updated) => {
                    // A mark caught leaving takes the pointer and the keyboard again.
                    takeBack(updated, 'lollipop');
                    return value(
                        position(size(animate(updated, { durationMs, name: 'lollipop' }))),
                    ).attr('opacity', 1);
                }),
            // Off the pointer and the keyboard at once (`leave`), then down to the baseline.
            (exit) =>
                exit.call((exited) =>
                    baseline(
                        leave(exited)
                            .transition('lollipop')
                            .duration(motionDuration(durationMs))
                            .ease(MOTION_EASE)
                            .attr('opacity', 0),
                    ).remove(),
                ),
        )
        .call(paint);
}

/**
 * The smallest head: the circle covering a comparison marker's area (`markerPath` gives
 * every marker shape 2·size²). The head is the primary datum, so it never shrinks below
 * the ⌀ markers drawn over it and stays the mark the eye lands on.
 */
const HEAD_MIN_RADIUS_PX = AVERAGE_MARKER.sizePx * Math.sqrt(2 / Math.PI);
/** The largest head, reached in a roomy card. */
const HEAD_MAX_RADIUS_PX = 9;

/**
 * The narrowest pitch between two lollipops: two of the largest heads side by side with
 * 2 px clear between. Below it neighbouring heads run into each other, so a chart that
 * cannot give every item this much grows past its card and scrolls. Rotated id labels
 * (one line of `--fs-sm`) fit the same pitch; a smaller
 * `HEAD_MAX_RADIUS_PX` would shrink it below them.
 */
const LOLLIPOP_MIN_PITCH_PX = 2 * HEAD_MAX_RADIUS_PX + 2;

/**
 * A lollipop's head radius and stem width, scaled to the container.
 * @param {number} geometryScale - The measured dimensions' `geometryScale`.
 * @returns {{circleRadius: number, lineStrokeWidth: number}} In px.
 */
export function lollipopMarkSizes(geometryScale) {
    return {
        circleRadius: Math.max(
            HEAD_MIN_RADIUS_PX,
            Math.min(HEAD_MAX_RADIUS_PX, geometryScale * 0.35),
        ),
        lineStrokeWidth: Math.max(1, Math.min(3, geometryScale * 0.15)),
    };
}

/**
 * The items by domain, in record order: domains as the payload lists them, items in
 * booklet order within each. Grouping keeps the first-seen order and merges a domain
 * the records split.
 * @template {{domainLabel: string}} TItem
 * @param {TItem[]} items
 * @returns {Array<[string, TItem[]]>}
 */
export function groupByDomain(items) {
    return [...d3.group(items, (item) => item.domainLabel)];
}

/**
 * Give every item at least `LOLLIPOP_MIN_PITCH_PX`. When the card cannot hold that,
 * the plot area scrolls; its key sits outside it and stays in view. Call before
 * `initializeSVG`.
 * @param {ChartRenderer} chart
 * @param {number} pitches - Pitches the plot spends on its items (and any gaps).
 * @param {number} axisWidthPx - The axis reserve beside the plot.
 * @param {number} [plotMarginPx] - Width the plot keeps clear of items at its edges.
 */
export function fitItemPitch(chart, pitches, axisWidthPx, plotMarginPx = 0) {
    chart.fitContentWidth(axisWidthPx + plotMarginPx + LOLLIPOP_MIN_PITCH_PX * pitches);
}

/**
 * The lollipop items' hit bands (`joinHitBands`): the item's one hover target and tab
 * stop. The item's stem, head and comparison markers share one tooltip (it lists the
 * comparison values), so none of them is wired: the band above them takes the
 * pointer and the keyboard, tints with the `band` look, and grows the item's stem
 * and head.
 * @template TDatum
 * @template {import('d3').BaseType} P
 * @template PD
 * @param {ChartRenderer} chart
 * @param {import('d3').Selection<P, PD, any, any>} g - The layer the bands are joined in, over the marks.
 * @param {TDatum[]} data - One band per datum.
 * @param {object} options
 * @param {(d: TDatum) => string} options.key - Join key, shared with the stems and heads.
 * @param {(d: TDatum) => number} options.position - The item's centre on the item axis.
 * @param {[number, number]} options.bounds - The plot's extent on the item axis.
 * @param {[number, number]} options.across - The band's extent on the value axis.
 * @param {boolean} [options.horizontal] - Items stacked down the y axis (rows) rather than along x.
 * @param {import('d3').Selection<any, TDatum, any, any>} options.stems - The stems the hover grows.
 * @param {import('d3').Selection<any, TDatum, any, any>} options.heads - The heads the hover grows.
 * @param {import('./internal/chartInteractionUtils.js').HoverEffect} [options.head] - The head's hover look, for a head that is no circle.
 * @param {(d: TDatum) => import('../../services/cursorTooltip.js').TooltipContent} options.getTooltipContent
 * @returns {import('d3').Selection<SVGRectElement, TDatum, P, PD>}
 */
export function joinLollipopHits(
    chart,
    g,
    data,
    {
        key,
        position,
        bounds,
        across,
        horizontal = false,
        stems,
        heads,
        head = HOVER_PRESETS.point,
        getTooltipContent,
    },
) {
    return chart.joinHitBands(g, data, {
        key,
        position,
        bounds,
        across,
        horizontal,
        className: 'lollipop-hit',
        getTooltipContent,
        linked: [
            { marks: stems, match: (s, d) => key(s) === key(d), effect: STEM_HOVER },
            { marks: heads, match: (h, d) => key(h) === key(d), effect: head },
        ],
    });
}

/**
 * Join vertical lollipops (a stem from the baseline and a round head at the value),
 * keyed, so a redraw moves each datum's pair in place, with the item's hit band over
 * them (`joinLollipopHits`) across the plot's width and up from the baseline. The
 * stems and the heads join in layers of their own inside `g` (`g.lollipop-stems`,
 * then `g.lollipop-heads`), so a stem that enters later still paints under every
 * head; the bands join in `hitLayer`, which the caller made after `g` and after any
 * marks of its own an item carries (comparison markers), so it lies over all of them.
 *
 * Every pass writes the sizes too, so a resize redrawn in place resizes the marks it
 * keeps. Pass `durationMs` 0 on a chart's first draw, where the entering marks would
 * otherwise rise from the baseline.
 * @template TDatum
 * @template {import('d3').BaseType} P
 * @template PD
 * @param {ChartRenderer} chart - Laid out: the hit bands span its plot's width.
 * @param {import('d3').Selection<P, PD, any, any>} g - The group the stem and head layers live in; one node.
 * @param {TDatum[]} data - One lollipop per datum, in draw order.
 * @param {object} options
 * @param {(d: TDatum) => string} options.key
 * @param {(d: TDatum) => number} options.x - The lollipop's x.
 * @param {(d: TDatum) => number} options.y - The head's y.
 * @param {number} options.baselineY - Where the stem starts, and where marks enter from.
 * @param {(d: TDatum) => string} options.color - Stem and head colour.
 * @param {number} options.stemWidthPx
 * @param {number} options.headRadiusPx
 * @param {number} options.durationMs - `0` applies at once.
 * @param {import('d3').Selection<any, any, any, any>} options.hitLayer - The layer the hit bands join in, over every mark of the item; one node.
 * @param {{getTooltipContent: (d: TDatum) => import('../../services/cursorTooltip.js').TooltipContent}} options.tooltip - The item's tooltip, on its hit band (`joinLollipopHits`).
 * @returns {{lines: import('d3').Selection<SVGLineElement, TDatum, SVGGElement, PD>, circles: import('d3').Selection<SVGCircleElement, TDatum, SVGGElement, PD>, hits: import('d3').Selection<SVGRectElement, TDatum, any, any>}}
 */
export function joinLollipops(
    chart,
    g,
    data,
    { key, x, y, baselineY, color, stemWidthPx, headRadiusPx, durationMs, hitLayer, tooltip },
) {
    const stemLayer = selectOrAppend(g, 'g', 'lollipop-stems', asDataMark);
    const headLayer = selectOrAppend(g, 'g', 'lollipop-heads', asDataMark);
    const lines = joinMarks(stemLayer, data, key, 'lollipop-line', 'line', durationMs, {
        size: (sel) => sel.attr('y1', baselineY).attr('stroke-width', stemWidthPx),
        fixed: (sel) => sel,
        paint: (sel) => sel.style('stroke', color),
        position: (sel) => sel.attr('x1', x).attr('x2', x),
        value: (sel) => sel.attr('y2', y),
        baseline: (sel) => sel.attr('y2', baselineY),
    });
    const circles = joinMarks(headLayer, data, key, 'lollipop-circle', 'circle', durationMs, {
        size: (sel) => sel.attr('r', headRadiusPx),
        // The surface ring's colour comes from the stylesheet, so forced colours can
        // repaint it through the cascade (lollipopMarks.css).
        fixed: (sel) => sel.attr('stroke-width', MARK_DEFAULTS.outlineWidthPx),
        paint: (sel) => sel.style('fill', color),
        position: (sel) => sel.attr('cx', x),
        value: (sel) => sel.attr('cy', y),
        baseline: (sel) => sel.attr('cy', baselineY),
    });
    // The size the hover grows from and returns to.
    setRestingSize(lines, 'stroke-width', stemWidthPx);
    setRestingSize(circles, 'r', headRadiusPx);
    const hits = joinLollipopHits(chart, hitLayer, data, {
        key,
        position: x,
        bounds: [0, chart.layout?.chart.width ?? 0],
        across: [0, baselineY],
        stems: lines,
        heads: circles,
        getTooltipContent: tooltip.getTooltipContent,
    });
    return { lines, circles, hits };
}
