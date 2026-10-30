/**
 * The comparison-average marker every chart draws the same way: a shape at a data
 * point, painted per `markerPaintForIndex`, with its centre dot, a visibility that
 * drives opacity and pointer events, and a tooltip that stays quiet while hidden.
 */

import { AVERAGE_MARKER } from './chartDefaults.js';
import { appendMarkerDot, markerHalfExtent, markerPath } from './markerSymbols.js';
import { animate, fadeOutAndRemove } from './motionPreference.js';
import {
    comparisonSeriesClass,
    comparisonSeriesPaint,
    comparisonSeriesVisual,
} from './comparisonSeries.js';
import { DATA_MARK_CLASS } from '../services/dataMark.js';

/**
 * How one marker family is painted — a `markerPaintForIndex` result fits.
 * @typedef {object} AverageMarkerPaint
 * @property {string} fill
 * @property {string} stroke
 * @property {number} strokeWidth
 * @property {string|null} [dotFill] - Centre dot fill; null draws none.
 */

/**
 * Join one average-marker family: one keyed `<g>` per marker, placed by its transform,
 * holding the shape and (for a paint that carries one) its centre dot at the origin.
 * The `<g>` is the marker to everything outside: its class, its visibility, its
 * tooltip and its tab stop. Opacity is written as a style, as
 * `ChartRenderer.setElementVisibility` writes it, so a later visibility pass and this
 * join never hold two different opacities for one mark.
 * @param {import('./renderers/chartRenderer.js').ChartRenderer} chart - Wires the tooltips.
 * @template {import('d3').BaseType} P
 * @template PD
 * @template TDatum
 * @param {import('d3').Selection<P, PD, any, any>} container
 * @param {TDatum[]} data - One datum per marker.
 * @param {object} o
 * @param {string} o.selector - Class unique to this family; the join selects on it.
 * @param {(d: NoInfer<TDatum>) => string} o.classFn - The full `class` attribute of a marker's `<g>`, re-applied on update so it follows the datum.
 * @param {string} o.shape - `square`, `diamond`, `triangle` or `cross`.
 * @param {(d: NoInfer<TDatum>) => string|number} o.key
 * @param {(d: NoInfer<TDatum>) => number} o.getX - Marker centre x.
 * @param {(d: NoInfer<TDatum>) => number} o.getY - Marker centre y.
 * @param {AverageMarkerPaint} o.paint
 * @param {number} [o.sizePx] - Nominal size, a diamond's half-extent (see `markerPath`).
 * @param {() => boolean} o.visible - Drives opacity and pointer events.
 * @param {number} o.durationMs - `0` applies at once.
 * @param {string} o.transitionName - Named transition, so an update cancels a pending exit.
 * @param {boolean} [o.fade] - Fade entering markers in and leaving ones out.
 * @param {{getTooltipContent: (d: NoInfer<TDatum>) => import('../services/cursorTooltip.js').TooltipContent}|null} [o.tooltip] - Tooltip, silent while hidden.
 * @returns {import('d3').Selection<SVGGElement, TDatum, P, PD>}
 */
export function joinAverageMarkers(
    chart,
    container,
    data,
    {
        selector,
        classFn,
        shape,
        key,
        getX,
        getY,
        paint,
        sizePx = AVERAGE_MARKER.sizePx,
        visible,
        durationMs,
        transitionName,
        fade = false,
        tooltip = null,
    },
) {
    const half = markerHalfExtent(shape, sizePx);
    const isVisible = visible();
    const opacity = isVisible ? 1 : 0;
    const pointerEvents = isVisible ? 'auto' : 'none';
    const ariaHidden = isVisible ? null : 'true';
    /** @type {(d: TDatum) => string} */
    const at = (d) => `translate(${getX(d)}, ${getY(d)})`;
    // Runs on enter and on update, so a kept marker follows a new shape, size and paint.
    // The dot is drawn again rather than patched: it carries the size as well.
    const paintMarker = (/** @type {import('d3').Selection<SVGGElement, TDatum, P, PD>} */ sel) => {
        sel.classed(DATA_MARK_CLASS, true);
        sel.select('.marker-shape')
            .attr('d', markerPath(shape, sizePx))
            .style('fill', paint.fill)
            .style('stroke', paint.stroke)
            .attr('stroke-width', paint.strokeWidth);
        sel.selectAll('.marker-dot').remove();
        if (!paint.dotFill) return;
        appendMarkerDot(sel, { cx: 0, cy: 0, sizePx: half, fill: paint.dotFill })
            // An attribute, not only the style: `setElementVisibility` clears the
            // marker's style on show, and the dot must stay inert.
            .attr('pointer-events', 'none');
    };

    const exitFade = (/** @type {import('d3').Selection<SVGGElement, TDatum, P, PD>} */ exit) =>
        fade ? fadeOutAndRemove(exit, transitionName, durationMs) : exit.remove();

    // Every node the family selector matches is a marker `<g>` this join made.
    const existing = /** @type {import('d3').Selection<SVGGElement, TDatum, P, PD>} */ (
        container.selectAll(`.${selector}`)
    );
    const markers = existing.data(data, key).join(
        (enter) => {
            const g = enter
                .append('g')
                .attr('class', classFn)
                .attr('transform', at)
                .style('opacity', fade ? 0 : opacity)
                .style('pointer-events', pointerEvents)
                .attr('aria-hidden', ariaHidden);
            g.append('path').attr('class', 'marker-shape');
            paintMarker(g);

            if (fade) animate(g, { durationMs, name: transitionName }).style('opacity', opacity);
            return g;
        },
        (update) => {
            // Pointer events switch at once, as a marker caught leaving (`exitFade`)
            // takes the pointer and the keyboard again.
            update
                .interrupt(transitionName)
                .attr('class', classFn)
                .style('pointer-events', pointerEvents)
                .attr('aria-hidden', ariaHidden);
            paintMarker(update);
            animate(update, { durationMs, name: transitionName })
                .attr('transform', at)
                .style('opacity', opacity);
            return update;
        },
        exitFade,
    );

    // Wired after the join, so an updated marker's accessible name follows its datum.
    if (tooltip) {
        chart.wireTooltipEvents(markers, {
            getTooltipContent: tooltip.getTooltipContent,
            isVisible: visible,
        });
    }
    return markers;
}

/**
 * Join one average-marker family per comparison group into `layer`, each in its role's
 * shape and paint, classed by its position (`comparisonSeriesClass`, what a comparison
 * toggle fades).
 * @template {import('./comparisonSeries.js').ComparisonSeriesGroup} TGroup
 * @template TDatum
 * @param {import('./renderers/chartRenderer.js').ChartRenderer} chart - Wires the tooltips and holds the visibility state.
 * @param {import('d3').Selection<SVGGElement, unknown, any, any>} layer
 * @param {ReadonlyArray<TGroup>} groups - In declared order.
 * @param {object} o
 * @param {string} o.baseClass - The family's classes every marker carries, before the series class.
 * @param {(group: TGroup) => TDatum[]} o.dataFor - One datum per marker of the group.
 * @param {(d: TDatum) => string|number} o.key
 * @param {(d: TDatum, group: TGroup) => number} o.getX - Marker centre x.
 * @param {(d: TDatum) => number} o.getY - Marker centre y.
 * @param {number} o.durationMs - `0` applies at once.
 * @param {string} o.transitionName - Named transition, so an update cancels a pending exit.
 * @param {number} [o.sizePx] - Nominal size (see `joinAverageMarkers`).
 * @param {boolean} [o.fade] - Fade entering markers in and leaving ones out.
 * @param {(d: TDatum) => string} [o.classSuffix] - Extra classes per marker, after a space.
 * @param {(group: TGroup) => {getTooltipContent: (d: TDatum) => import('../services/cursorTooltip.js').TooltipContent}} [o.tooltipFor] - The group's marker tooltip.
 */
export function joinComparisonMarkers(
    chart,
    layer,
    groups,
    { baseClass, dataFor, getX, classSuffix = () => '', tooltipFor, ...rest },
) {
    groups.forEach((group, index) => {
        // Its own selector: the series class names every mark of the group, which the
        // join must not take for a marker.
        const seriesClass = comparisonSeriesClass(index);
        const selector = `${seriesClass}-marker`;
        joinAverageMarkers(chart, layer, dataFor(group), {
            ...rest,
            selector,
            classFn: (d) => `${baseClass} ${selector} ${seriesClass}${classSuffix(d)}`,
            shape: comparisonSeriesVisual(group).symbol,
            getX: (d) => getX(d, group),
            paint: comparisonSeriesPaint(group),
            visible: () => chart.visibilityState[group.id],
            tooltip: tooltipFor?.(group) ?? null,
        });
    });
}
