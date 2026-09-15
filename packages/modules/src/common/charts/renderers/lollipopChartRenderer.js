/**
 * LollipopChartRenderer — base class for the lollipop chart renderers.
 *
 * Extends ChartRenderer with coordinated hover for a lollipop's stem+head pair, so
 * hovering either element highlights both. Every lollipop chart extends this rather
 * than ChartRenderer directly.
 *
 * A hover config left out is generated from what is already drawn: the stem's scaling
 * from the first stem's current stroke-width, the head's from the first head's `r`.
 * That is why the defaults are read at wire time rather than declared as constants.
 */

import { ChartRenderer } from './chartRenderer.js';
import {
    MARKER_DOT_RATIO,
    getDiamondPath,
    getTrianglePath,
    getCrossPath,
} from '../markerSymbols.js';
import { getThemeColors } from '../../services/themeService.js';
import { motionDuration, prefersReducedMotion } from '../motionPreference.js';
import * as d3 from 'd3';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default hover effect constants for lollipop charts.
 * Used automatically when stem/head hover configs are omitted from wireLollipopPairEvents.
 * Charts can override by passing explicit stem/head configs.
 */
const LOLLIPOP_HOVER = Object.freeze({
    /** Scale factor for circle radius on hover */
    HEAD_SCALE: 1.3,
    /** Scale factor for line stroke-width on hover */
    STEM_SCALE: 1.5,
});

/**
 * Path generators for the `path`-based average markers. `square` is absent on
 * purpose — it is drawn as a `rect`, not a path (see `joinAverageMarker`).
 */
const MARKER_PATH_BY_SHAPE = Object.freeze({
    diamond: getDiamondPath,
    triangle: getTrianglePath,
    cross: getCrossPath,
});

// ============================================================================
// LOLLIPOP CHART RENDERER CLASS
// ============================================================================

export class LollipopChartRenderer extends ChartRenderer {
    /**
     * Wire coordinated hover events for lollipop stem (line) and head (circle) pairs.
     *
     * Hovering either the stem or the head applies hover effects to BOTH elements,
     * and shows a tooltip. This replaces the need to call wireTooltipEvents separately
     * for stems and heads.
     *
     * Pairing is done via `getKey` — both selections must produce the same key for
     * corresponding elements. By default, elements are paired by their index in
     * the selection.
     *
     * When `stem`/`head` configs are omitted, hover effects are auto-generated from
     * the current element attributes using `LOLLIPOP_HOVER` scale constants.
     * @param {d3.Selection} stemSelection - D3 selection of line (stem) elements
     * @param {d3.Selection} headSelection - D3 selection of circle (head) elements
     * @param {object} options - Configuration options
     * @param {Function} options.getTooltipContent - (d) => string — tooltip HTML
     * @param {object} [options.head] - Head hover effect config. If omitted, auto-generates
     *        radius scaling from current element values using LOLLIPOP_HOVER.HEAD_SCALE.
     * @param {object} [options.head.enter] - Attributes/styles to apply on mouseenter
     * @param {object} [options.head.leave] - Attributes/styles to apply on mouseleave
     * @param {number} [options.darkenHead] - Amount to darken head fill on hover (e.g., 0.3).
     *        Automatically captures each head's current fill at setup time. Works with both
     *        uniform and data-dependent fills. Additive to head.enter/leave configs.
     * @param {string} [options.getKey] - Data property pairing stem+head elements
     *        (e.g., `'itemId'`). Defaults to index-based pairing.
     * @param {string} [options.tooltipId] - Custom tooltip ID suffix
     * @returns {void}
     * @example
     * // Minimal usage — auto-generates stem + head hover from current attributes
     * this.wireLollipopPairEvents(lines, circles, {
     *     getTooltipContent: (d) => this.formatTooltipContent(d),
     *     tooltipId: 'my-lollipop',
     *     darkenHead: 0.3
     * });
     */
    wireLollipopPairEvents(stemSelection, headSelection, options = /** @type {any} */ ({})) {
        const {
            getTooltipContent,
            head: headInput,
            darkenHead = null,
            getKey: keyProperty = null,
            tooltipId = null,
        } = options;

        const getKey = keyProperty ? (d) => d[keyProperty] : null;

        const chartInstance = this;
        const tooltip = this.createTooltip(tooltipId ?? undefined);

        // --- Auto-generate default hover effects from current element attributes ---
        const stem = {};
        const head = headInput ? { ...headInput } : {};

        // Auto-default: stem stroke-width scaling
        const firstStem = stemSelection.node();
        if (firstStem) {
            const el = d3.select(firstStem);
            const currentWidth = parseFloat(el.attr('stroke-width') ?? el.style('stroke-width'));
            if (!isNaN(currentWidth)) {
                stem.enter = { 'stroke-width': currentWidth * LOLLIPOP_HOVER.STEM_SCALE };
                stem.leave = { 'stroke-width': currentWidth };
            }
        }

        // Auto-default: head radius scaling
        if (!head.enter && !head.leave) {
            const firstHead = headSelection.node();
            if (firstHead) {
                const currentRadius = parseFloat(d3.select(firstHead).attr('r'));
                if (!isNaN(currentRadius)) {
                    head.enter = { r: currentRadius * LOLLIPOP_HOVER.HEAD_SCALE };
                    head.leave = { r: currentRadius };
                }
            }
        }

        // --- Build pairing maps: key → DOM element, DOM element → key ---
        const stemMap = new Map();
        const headMap = new Map();
        const elementToKey = new Map();

        stemSelection.each(function (d, i) {
            const key = getKey ? getKey(d) : i;
            stemMap.set(key, this);
            elementToKey.set(this, key);
        });

        headSelection.each(function (d, i) {
            const key = getKey ? getKey(d) : i;
            headMap.set(key, this);
            elementToKey.set(this, key);
        });

        // --- darkenHead: capture each head's original fill at setup time ---
        let originalFills = null;
        if (darkenHead != null) {
            originalFills = new Map();
            headSelection.each(function (d, i) {
                const key = getKey ? getKey(d) : i;
                const el = d3.select(this);
                originalFills.set(key, el.attr('fill') ?? el.style('fill'));
            });
        }

        /**
         * Apply enter effects to both stem and head
         * @param {string|number} key - Pair key
         * @param {object} d - Data bound to hovered element
         */
        const applyEnter = (key, d) => {
            const stemEl = stemMap.get(key);
            const headEl = headMap.get(key);
            if (stemEl && stem.enter) {
                chartInstance._applyHoverEffect(stemEl, stem.enter, d, true);
            }
            if (headEl && head.enter) {
                chartInstance._applyHoverEffect(headEl, head.enter, d, true);
            }
            if (headEl && originalFills) {
                const origFill = originalFills.get(key);
                if (origFill) {
                    const darkenedFill = d3
                        .color(origFill)
                        ?.darker(darkenHead ?? undefined)
                        .toString();
                    if (darkenedFill) {
                        chartInstance._applyHoverEffect(headEl, { fill: darkenedFill }, d, true);
                    }
                }
            }
        };

        /**
         * Apply leave effects to both stem and head
         * @param {string|number} key - Pair key
         * @param {object} d - Data bound to hovered element
         */
        const applyLeave = (key, d) => {
            const stemEl = stemMap.get(key);
            const headEl = headMap.get(key);
            if (stemEl && stem.leave) {
                chartInstance._applyHoverEffect(stemEl, stem.leave, d, true);
            }
            if (headEl && head.leave) {
                chartInstance._applyHoverEffect(headEl, head.leave, d, true);
            }
            if (headEl && originalFills) {
                const origFill = originalFills.get(key);
                if (origFill) {
                    chartInstance._applyHoverEffect(headEl, { fill: origFill }, d, true);
                }
            }
        };

        // Clear any previously wired events before re-attaching.
        // Prevents stale closure Maps from accumulating when
        // wireLollipopPairEvents is called on every data update.
        [stemSelection, headSelection].forEach((selection) => {
            selection.on('mouseenter', null).on('mousemove', null).on('mouseleave', null);
        });

        // Wire events on both selections
        [stemSelection, headSelection].forEach((selection) => {
            selection.on('mouseenter', function (event, d) {
                const key = elementToKey.get(this);
                applyEnter(key, d);
                chartInstance.showTooltip(tooltip, event, getTooltipContent(d));
            });

            selection.on('mousemove', function (event) {
                chartInstance.moveTooltip(tooltip, event);
            });

            selection.on('mouseleave', function (event, d) {
                const key = elementToKey.get(this);
                applyLeave(key, d);
                chartInstance.hideTooltip(tooltip);
            });
        });
    }

    /**
     * Return a transition for animated updates, or the selection itself when
     * `duration` is 0 (instant). Centralizes the `instant ? sel : sel.transition(...)`
     * idiom used throughout the join-based update paths. The transition is *named* so a
     * matching `selection.interrupt(name)` can cancel a pending exit without disturbing
     * unrelated transitions on the same elements.
     * @param {d3.Selection} selection - Selection to (maybe) transition
     * @param {string} name - Named transition key (e.g. 'lollipop', 'avg')
     * @param {number} duration - Duration in ms; 0 returns the selection unchanged (instant)
     * @returns {*} Transition when duration > 0, else the selection (both d3-chainable)
     * @example
     * update => {
     *     update.interrupt('lollipop');
     *     return this.maybeTransition(update, 'lollipop', duration)
     *         .attr('cx', d => x(d)).attr('cy', d => y(d));
     * }
     */
    maybeTransition(selection, name, duration) {
        const d = motionDuration(duration);
        return d === 0 ? selection : selection.transition(name).duration(d);
    }

    /**
     * Render one average-marker family via a keyed enter/update/exit join with the
     * shared lollipop pattern: a shape marker (square `rect` / diamond or triangle
     * `path`) positioned at a data point, whose opacity + pointer-events are driven by
     * a `visible()` predicate, with an `isVisible`-guarded tooltip and a named transition.
     *
     * Collapses the near-identical state-square / school-diamond join blocks that were
     * duplicated across the EN item and style lollipop charts.
     * @param {d3.Selection} container - Group to join markers into (usually `this.g`)
     * @param {Array} data - Data array for the keyed join
     * @param {object} o - Options
     * @param {string} o.selector - Unique class used to select + join (e.g. 'state-average-marker')
     * @param {*} o.classFn - (d) => full `class` attribute string to apply
     * @param {'square'|'diamond'|'triangle'|'cross'} o.shape - Marker shape
     * @param {*} o.key - (d) => join key
     * @param {Function} o.getX - (d) => marker centre x
     * @param {Function} o.getY - (d) => marker centre y
     * @param {number} o.size - Marker size (square half-extent / path size argument)
     * @param {string} o.fill - Marker fill colour
     * @param {string} [o.stroke] - Stroke colour (defaults to theme chartStroke)
     * @param {number} [o.strokeWidth=1] - Stroke width
     * @param {string|null} [o.dotFill=null] - Centre dot fill (see `markerPaintForIndex`); null draws none
     * @param {Function} o.visible - () => boolean — drives opacity + pointer-events
     * @param {number} [o.visibleOpacity=0.8] - Opacity when visible
     * @param {number} o.duration - Transition duration (0 = instant)
     * @param {string} o.transitionName - Named transition key (paired with interrupt)
     * @param {boolean} [o.fade=false] - Animate enter (0→opacity) and exit (opacity→0) when duration>0
     * @param {object} [o.tooltip] - { getTooltipContent, tooltipId } wired on enter with isVisible guard
     * @returns {void}
     */
    joinAverageMarker(
        container,
        data,
        {
            selector,
            classFn,
            shape,
            key,
            getX,
            getY,
            size,
            fill,
            stroke = getThemeColors().chrome.chartStroke,
            strokeWidth = 1,
            dotFill = null,
            visible,
            visibleOpacity = 0.8,
            duration,
            transitionName,
            fade = false,
            tooltip = null,
        },
    ) {
        const isSquare = shape === 'square';
        const pathFn = MARKER_PATH_BY_SHAPE[shape] ?? getDiamondPath;
        const isVisible = visible();
        const opacity = isVisible ? visibleOpacity : 0;
        const pointerEvents = isVisible ? 'auto' : 'none';
        const animate = fade && duration > 0 && !prefersReducedMotion();

        // Apply the position attributes appropriate to the element type.
        const applyPosition = (sel) =>
            isSquare
                ? sel.attr('x', (d) => getX(d) - size).attr('y', (d) => getY(d) - size)
                : sel.attr('d', (d) => pathFn(getX(d), getY(d), size));

        container
            .selectAll(`.${selector}`)
            .data(data, key)
            .join(
                (enter) => {
                    const el = enter.append(isSquare ? 'rect' : 'path').attr('class', classFn);
                    applyPosition(el);
                    if (isSquare) el.attr('width', size * 2).attr('height', size * 2);
                    el.attr('fill', fill)
                        .attr('stroke', stroke)
                        .attr('stroke-width', strokeWidth)
                        .attr('opacity', animate ? 0 : opacity)
                        .style('pointer-events', pointerEvents);

                    if (tooltip) {
                        this.wireTooltipEvents(el, {
                            getTooltipContent: tooltip.getTooltipContent,
                            tooltipId: tooltip.tooltipId,
                            isVisible: visible,
                            interactive: true,
                        });
                    }

                    if (animate) {
                        el.transition(transitionName).duration(duration).attr('opacity', opacity);
                    }
                    return el;
                },
                (update) => {
                    update.interrupt(transitionName);
                    applyPosition(this.maybeTransition(update, transitionName, duration))
                        .attr('opacity', opacity)
                        .style('pointer-events', pointerEvents);
                    return update;
                },
                (exit) =>
                    animate
                        ? exit
                              .transition(transitionName)
                              .duration(duration)
                              .attr('opacity', 0)
                              .remove()
                        : exit.remove(),
            );

        // The centre dot, a second keyed join that follows the marker: present only
        // for the paint modes that carry one, inert to the pointer.
        const dotSelector = `${selector}-dot`;
        const placeDot = (sel) => sel.attr('cx', (d) => getX(d)).attr('cy', (d) => getY(d));
        container
            .selectAll(`.${dotSelector}`)
            .data(dotFill ? data : [], key)
            .join(
                (enter) => {
                    const dot = enter
                        .append('circle')
                        .attr('class', `marker-dot ${dotSelector}`)
                        .attr('r', size * MARKER_DOT_RATIO)
                        .attr('fill', dotFill)
                        .attr('opacity', animate ? 0 : opacity)
                        .style('pointer-events', 'none');
                    placeDot(dot);
                    if (animate) {
                        dot.transition(transitionName).duration(duration).attr('opacity', opacity);
                    }
                    return dot;
                },
                (update) => {
                    update.interrupt(transitionName);
                    placeDot(this.maybeTransition(update, transitionName, duration)).attr(
                        'opacity',
                        opacity,
                    );
                    return update;
                },
                (exit) =>
                    animate
                        ? exit
                              .transition(transitionName)
                              .duration(duration)
                              .attr('opacity', 0)
                              .remove()
                        : exit.remove(),
            );
    }

    /**
     * Create standardized vertical lollipop elements (stems + heads) using `.attr()`.
     *
     * Creates lines (stems) from a baseline to data values, and circles (heads)
     * at data positions. Uses D3 enter pattern with simple data join.
     * All SVG presentation attributes use `.attr()` per project convention.
     *
     * Does NOT wire hover/tooltip events — call `wireLollipopPairEvents()`
     * on the returned selections for that.
     * @param {d3.Selection} g - Chart group to append elements to
     * @param {Array} data - Data array for D3 data join
     * @param {object} options - Element configuration
     * @param {*} options.x - Accessor `(d) => number` for x position
     * @param {*} options.y - Accessor `(d) => number` for y position (data value)
     * @param {number} options.baselineY - Y coordinate for stem start (usually chartHeight)
     * @param {*} options.stemColor - Stem stroke color: `(d) => color` or string
     * @param {*} options.headColor - Head fill color: `(d) => color` or string
     * @param {number} options.stemWidth - Stem stroke-width
     * @param {number} options.headRadius - Head circle radius
     * @returns {{ lines: d3.Selection, circles: d3.Selection }} Created selections
     * @example
     * const { lines, circles } = this.createStandardLollipops(g, data, {
     *     x: d => xScale(d.nummerierung) + xScale.bandwidth() / 2,
     *     y: d => yScale(d.percentage),
     *     baselineY: chartHeight,
     *     stemColor: d => niveaustufeColors[d.niveaustufe],
     *     headColor: d => niveaustufeColors[d.niveaustufe],
     *     stemWidth: elements.lineStrokeWidth,
     *     headRadius: elements.circleRadius
     * });
     * this.wireLollipopPairEvents(lines, circles, { ... });
     */
    createStandardLollipops(g, data, options) {
        const { x, y, baselineY, stemColor, headColor, stemWidth, headRadius } = options;

        const lines = g
            .selectAll('.lollipop-line')
            .data(data)
            .enter()
            .append('line')
            .attr('class', 'lollipop-line')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', baselineY)
            .attr('y2', y)
            .attr('stroke', stemColor)
            .attr('stroke-width', stemWidth);

        const circles = g
            .selectAll('.lollipop-circle')
            .data(data)
            .enter()
            .append('circle')
            .attr('class', 'lollipop-circle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', headRadius)
            .attr('fill', headColor)
            .attr('stroke', getThemeColors().chrome.chartStroke)
            .attr('stroke-width', 2);

        return { lines, circles };
    }
}
