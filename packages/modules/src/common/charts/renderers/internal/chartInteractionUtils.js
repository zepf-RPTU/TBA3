/**
 * The hover presets and the mark-anchored tooltip event wiring; ChartRenderer is
 * the public facade.
 *
 * Keyboard access follows the Highcharts accessibility module: every wired mark is
 * focusable and named by its tooltip text; keyboard focus shows the hover look and the
 * tooltip, Enter and Space click. `MarkKeyboard` owns the roving tab stop that moves focus
 * between the marks.
 */

import * as d3 from 'd3';
import { isActivationKey } from '@tba3/module-base';
import { cursorTooltip } from '../../../services/cursorTooltip.js';
import { MARK_DEFAULTS } from '../../chartDefaults.js';
import { MOTION, animate } from '../../motionPreference.js';

/** Hover properties written as inline styles; every other key is an attribute. */
const CSS_PROPERTIES = new Set(['opacity', 'fill']);

/**
 * Opacity of a hovered area mark. `--chart-hover-opacity` mirrors it for the HTML
 * stacked bars, and a unit test keeps the two equal.
 */
const HOVER_OPACITY = 0.8;

/**
 * Fields a caller hands along to its own chart callbacks; the chart only passes them on.
 * @typedef {{[field: string]: any}} ChartCallbackContext
 */

/**
 * Attributes and styles a hover state applies; a function value is called with the
 * datum and the element.
 * @typedef {{[property: string]: string|number|boolean|null|((d: any, element: Element) => string|number|boolean|null)}} HoverStyleMap
 */

/**
 * A hover effect: the styles applied on enter and on leave.
 * @typedef {object} HoverEffect
 * @property {HoverStyleMap} [enter] - Applied on pointer hover and on keyboard focus.
 * @property {HoverStyleMap} [leave] - Applied when either ends.
 * @property {boolean} [useTransition] - Animate at `MOTION.FAST_MS` (instant under reduced motion).
 */

/**
 * A hover preset's name (see `HOVER_PRESETS`), or an effect of the chart's own.
 * @typedef {'area'|'point'|'band'|HoverEffect} HoverEffectOption
 */

/** @type {WeakMap<Element, {[attribute: string]: number}>} */
const restingSizes = new WeakMap();

/** @type {WeakSet<Element>} Marks whose keyboard focus applied the hover and showed the tooltip. */
const keyboardFocused = new WeakSet();

/** @type {WeakMap<Element, (d: any) => boolean>} Each focusable mark's `isVisible` guard. */
const visibilityGuards = new WeakMap();

/**
 * Whether a focusable mark is shown: a hidden one answers neither the pointer nor the
 * keyboard, and the arrow keys skip it. Hidden is its `isVisible` guard saying so, or
 * the mark or a group around it taken off the pointer (`pointer-events: none`) or out of
 * the layout (`display: none`): how a legend toggle hides a bar group and a leaving join
 * retires a mark, in charts that hide without a guard.
 * @param {Element} element - A mark `wireTooltipEvents` made focusable.
 * @returns {boolean}
 */
export function isMarkShown(element) {
    const guard = visibilityGuards.get(element);
    if (guard && !guard(d3.select(element).datum())) return false;
    // Inline styles only, as the hide paths write them: no forced style recalculation
    // while a render wires its marks. The nearest inline `pointer-events` wins, as it
    // would in the cascade.
    let pointerEvents = '';
    for (
        let /** @type {Element|null} */ node = element;
        node instanceof SVGElement;
        node = node.parentElement
    ) {
        if (node.style.display === 'none') return false;
        pointerEvents ||= node.style.pointerEvents;
    }
    return pointerEvents !== 'none';
}

/**
 * An element's resting size, read the first time it grows: the hover writes the
 * attribute, so a later read could catch it mid-growth.
 * @param {Element} element
 * @param {string} attribute - The size attribute (`r`, `stroke-width`).
 * @returns {number}
 */
function restingSize(element, attribute) {
    let sizes = restingSizes.get(element);
    if (!sizes) {
        sizes = {};
        restingSizes.set(element, sizes);
    }
    // A size set as a style rather than an attribute is read from the computed style,
    // so the hover never writes `NaN`.
    sizes[attribute] ??= parseFloat(
        element.getAttribute(attribute) ?? getComputedStyle(element).getPropertyValue(attribute),
    );
    return sizes[attribute];
}

/**
 * Tell the hover the size a draw just gave its marks. A chart that redraws in place
 * resizes the marks it keeps (a resize, a new head radius), and the size the hover read
 * on an earlier pass would otherwise be what `leave` puts back.
 * @param {import('d3').Selection<any, any, any, any>} marks - The marks the draw sized.
 * @param {string} attribute - The size attribute (`r`, `stroke-width`).
 * @param {number} value - Their resting size now.
 */
export function setRestingSize(marks, attribute, value) {
    marks.each(function () {
        const sizes = restingSizes.get(this) ?? {};
        sizes[attribute] = value;
        restingSizes.set(this, sizes);
    });
}

/**
 * Grow a size attribute by `scale` while hovered, animated.
 * @param {string} attribute
 * @param {number} scale - Hovered size over resting size.
 * @returns {HoverEffect}
 */
function growHover(attribute, scale) {
    return {
        enter: { [attribute]: (d, element) => restingSize(element, attribute) * scale },
        leave: { [attribute]: (d, element) => restingSize(element, attribute) },
        useTransition: true,
    };
}

/**
 * The three hover looks every chart mark takes one of. Hover only dims, grows or tints,
 * and `leave` puts back what `enter` changed, so a mark's resting look never lives in
 * the property a hover writes.
 * - `area`: a bar, segment, arc or box dims to `HOVER_OPACITY`.
 * - `point`: a circle grows its `r` by `MARK_DEFAULTS.hoverScale.head`.
 * - `band`: a transparent hit rect over a figure takes a faint tint.
 * @type {Readonly<{area: HoverEffect, point: HoverEffect, band: HoverEffect}>}
 */
export const HOVER_PRESETS = Object.freeze({
    area: { enter: { opacity: HOVER_OPACITY }, leave: { opacity: null } },
    point: growHover('r', MARK_DEFAULTS.hoverScale.head),
    band: { enter: { fill: 'var(--chart-hover-band)' }, leave: { fill: null } },
});

/** A lollipop stem's half of the `point` look: its width grows with the head. */
export const STEM_HOVER = growHover('stroke-width', MARK_DEFAULTS.hoverScale.stem);

/**
 * How `wireTooltipEvents` builds a tooltip and reacts to the pointer.
 * @template [TDatum=any]
 * @typedef {object} TooltipWiringOptions
 * @property {(d: TDatum) => import('../../../services/cursorTooltip.js').TooltipContent} getTooltipContent
 * @property {HoverEffectOption|null} [hoverEffect] - A preset name or an effect; none leaves the mark as it is.
 * @property {((d: TDatum) => boolean)|null} [isVisible] - Guard: a hidden mark answers no hover.
 * @property {((d: TDatum, event: MouseEvent|KeyboardEvent, element: Element) => void)|null} [onClick] - Click handler; Enter and Space on the focused mark call it too, and the cursor turns into a pointer.
 * @property {LinkedMarks<TDatum>[]} [linked] - Marks the hovered one stands for, restyled with it on pointer and keyboard hover alike: a hit target's figure (a lollipop's stem and head, a year's dots).
 * @property {boolean} [pointer] - False when a pointer layer picks the target itself (`wireNearestPointer`): the marks get no mouse listeners and no cursor.
 */

/**
 * Marks a hover target stands for: each mark `match` pairs with the hovered datum takes
 * `effect`, animated when the effect says so (`useTransition`).
 * @template [TDatum=any]
 * @typedef {object} LinkedMarks
 * @property {import('d3').Selection<any, any, any, any>} marks
 * @property {(mark: any, d: TDatum) => boolean} match - Whether a mark belongs to the hovered datum.
 * @property {HoverEffectOption} effect
 */

/**
 * A hover option as an effect: a preset name looked up, an effect as it is.
 * @param {HoverEffectOption|null} option
 * @returns {HoverEffect|null}
 */
function resolveHoverEffect(option) {
    return typeof option === 'string' ? HOVER_PRESETS[option] : option;
}

/**
 * Apply one state of a hover effect to an element.
 * @param {Element} element
 * @param {HoverStyleMap|undefined} styles - None is a no-op.
 * @param {unknown} data - Data bound to the element, passed to any accessor in the map.
 * @param {boolean} [useTransition] - Animate at `MOTION.FAST_MS` rather than jump.
 */
function applyHoverEffect(element, styles, data, useTransition = false) {
    if (!styles) return;

    const selection = d3.select(element);
    // Named, so a hover never interrupts the chart's own transitions on the mark.
    const target = useTransition
        ? animate(selection, { durationMs: MOTION.FAST_MS, name: 'hover' })
        : selection;

    Object.entries(styles).forEach(([property, value]) => {
        const resolvedValue = typeof value === 'function' ? value(data, element) : value;
        // Branched on null, because d3's overloads take a constant or null, never a
        // union of them; a constant keeps d3's constant fast path on a transition.
        const isCss = CSS_PROPERTIES.has(property);
        if (resolvedValue === null) {
            if (isCss) target.style(property, null);
            else target.attr(property, null);
        } else if (isCss) {
            target.style(property, resolvedValue);
        } else {
            target.attr(property, resolvedValue);
        }
    });
}

/**
 * What a mark does when the pointer reaches, follows, leaves or clicks it, as plain
 * functions: `wireTooltipEvents` binds them to the mark's own mouse events, and
 * `wireNearestPointer` calls them for the point nearest the pointer.
 * @template TDatum
 * @typedef {object} MarkHandlers
 * @property {(element: Element, data: TDatum) => void} enter - Hover look on, tooltip shown beside the mark.
 * @property {(element: Element, data: TDatum) => void} leave - Hover look off, tooltip hidden.
 * @property {((element: Element, data: TDatum, event: MouseEvent|KeyboardEvent) => void)|null} click - Null when the marks do not click.
 * @property {string|null} cursor - The cursor over a mark; null for the default.
 */

/**
 * Wire pointer and keyboard events on a selection so it shows, follows and hides a
 * tooltip.
 *
 * A focusable mark gets `tabindex="-1"` (`MarkKeyboard` hands one mark the tab stop),
 * `role` `button` when it clicks and `img` otherwise, and its tooltip text as
 * `aria-label`: set here for every mark (with `relabel` false only for a mark that has
 * none yet), so a screen reader browsing the chart hears each one, and again on focus,
 * since a tooltip can read state that changed since.
 * @template TDatum
 * @param {import('d3').Selection<any, TDatum, any, any>} selection
 * @param {TooltipWiringOptions<TDatum>} options
 * @param {boolean} focusable - False for the marks of a chart inside a control (`focusableMarks: false`): no tab stop, and hidden from assistive tech, which reads the control.
 * @param {boolean} relabel - False for a resize-only pass, whose data and state are unchanged: only a mark without an `aria-label` gets one.
 * @returns {MarkHandlers<TDatum>} The marks' pointer handlers, for a pointer layer that resolves its own target.
 */
export function wireTooltipEvents(selection, options, focusable, relabel) {
    const {
        getTooltipContent,
        hoverEffect = null,
        isVisible = null,
        onClick = null,
        linked = [],
        pointer = true,
    } = options;
    const cursor = onClick ? 'pointer' : null;
    const effect = resolveHoverEffect(hoverEffect);
    const linkedEffects = linked.map((link) => ({
        ...link,
        effect: resolveHoverEffect(link.effect),
    }));

    /**
     * Apply one hover state to a mark and to the marks it stands for.
     * @param {Element} element
     * @param {TDatum} data
     * @param {'enter'|'leave'} state
     */
    const hover = (element, data, state) => {
        applyHoverEffect(element, effect?.[state], data, effect?.useTransition);
        for (const { marks, match, effect: linkedEffect } of linkedEffects) {
            marks
                .filter((mark) => match(mark, data))
                .each(function (mark) {
                    applyHoverEffect(
                        this,
                        linkedEffect?.[state],
                        mark,
                        linkedEffect?.useTransition,
                    );
                });
        }
    };

    /** @type {MarkHandlers<TDatum>} */
    const handlers = {
        enter(element, data) {
            if (isVisible && !isVisible(data)) return;
            hover(element, data, 'enter');
            cursorTooltip.show(element, getTooltipContent(data));
        },
        leave(element, data) {
            if (isVisible && !isVisible(data)) return;
            hover(element, data, 'leave');
            cursorTooltip.leave(element);
        },
        click: onClick && ((element, data, event) => onClick(data, event, element)),
        cursor,
    };

    if (pointer) {
        if (cursor) selection.style('cursor', cursor);

        selection.on('mouseenter', function (event, data) {
            handlers.enter(this, data);
        });

        selection.on('mouseleave', function (event, data) {
            handlers.leave(this, data);
        });

        if (onClick) {
            selection.on('click', function (event, data) {
                onClick(data, event, this);
            });
        }
    }

    if (!focusable) {
        selection.attr('aria-hidden', 'true');
        return handlers;
    }

    selection.each(function (data) {
        // A re-wired mark keeps its tabindex: it may hold the chart's tab stop.
        if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '-1');
        this.setAttribute('role', onClick ? 'button' : 'img');
        if (relabel || !this.hasAttribute('aria-label')) {
            this.setAttribute('aria-label', cursorTooltip.toPlainText(getTooltipContent(data)));
        }
        if (isVisible) visibilityGuards.set(this, isVisible);
        else visibilityGuards.delete(this);
    });

    // Only keyboard focus shows the tooltip: a click focuses the mark as well, and the
    // pointer's tooltip is already up. Blur undoes only what a keyboard focus did.
    selection.on('focus', function (event, data) {
        if (!this.matches(':focus-visible') || !isMarkShown(this)) return;
        keyboardFocused.add(this);

        hover(this, data, 'enter');

        const content = getTooltipContent(data);
        this.setAttribute('aria-label', cursorTooltip.toPlainText(content));
        cursorTooltip.show(this, content);
    });

    selection.on('blur', function (event, data) {
        if (!keyboardFocused.delete(this)) return;

        hover(this, data, 'leave');

        // Leaving by keyboard ends an Escape dismissal too, so the next focus shows it.
        cursorTooltip.leave(this);
        cursorTooltip.hide();
    });

    selection.on('keydown', function (event, data) {
        if (event.key === 'Escape') {
            // Handled only when a tooltip was up: the overlay the chart sits in stays
            // open, and the next Escape closes it.
            if (cursorTooltip.isShown()) event.preventDefault();
            cursorTooltip.hide();
        } else if (onClick && isActivationKey(event)) {
            // Space would scroll the page.
            event.preventDefault();
            onClick(data, event, this);
        }
    });

    return handlers;
}

/** @type {WeakMap<Element, () => void>} Per chart root, how its nearest-point wiring lets go of the hovered point. */
const nearestReleases = new WeakMap();

/**
 * Nearest-point targeting, for points packed closer than the minimum target size,
 * where a target shape per point would overlap its neighbours and the one painted last
 * would take the pointer. The pointer picks the point nearest to it (a Delaunay lookup)
 * within half the minimum target size and calls that point's handlers. A pointer on
 * another wired mark (an average marker over the cloud) leaves the points to it. A
 * click that moved more than a few pixels was a drag and picks nothing. A redraw wires
 * the root again: the point the last wiring hovered goes back to rest, and no points
 * leave the root without the listeners.
 * @template TDatum
 * @template {Element} E
 * @param {import('d3').Selection<SVGSVGElement, unknown, any, any>} surface - The chart root that listens.
 * @param {import('d3').Selection<E, TDatum, any, any>} points - The points; their parent is the coordinate space of `position`.
 * @param {MarkHandlers<TDatum>} handlers - The points' handlers (`wireTooltipEvents`).
 * @param {object} options
 * @param {(d: TDatum) => [number, number]} options.position - A point's centre in its parent's coordinates.
 * @param {() => boolean} [options.suspended] - True while the pointer belongs to something else (a marquee drag).
 */
export function wireNearestPointer(
    surface,
    points,
    handlers,
    { position, suspended = () => false },
) {
    const root = /** @type {SVGSVGElement} */ (surface.node());
    nearestReleases.get(root)?.();
    const marks = points.nodes();
    if (marks.length === 0) {
        surface.on('.nearest', null);
        nearestReleases.delete(root);
        return;
    }
    const data = points.data();
    const layer = /** @type {Element} */ (marks[0].parentElement);
    const centres = data.map(position);
    const delaunay = d3.Delaunay.from(centres);
    const reach = MARK_DEFAULTS.minHitSizePx / 2;
    /** @type {number} index of the hovered point, -1 for none */
    let hovered = -1;
    /** @type {[number, number]|null} */
    let downAt = null;

    /**
     * @param {MouseEvent} event
     * @returns {number} The targeted point's index; -1 for none.
     */
    const nearest = (event) => {
        // Only a wired mark inside the chart: the page around it has focusable
        // containers too (the app root, a scrolling chart host).
        const owner = /** @type {Element} */ (event.target).closest('[tabindex]');
        if (owner && owner !== root && root.contains(owner)) return -1;
        const [x, y] = d3.pointer(event, layer);
        // Started at the hovered point, the walk stays short as the pointer moves.
        const i = delaunay.find(x, y, Math.max(hovered, 0));
        if (i < 0) return -1;
        return Math.hypot(centres[i][0] - x, centres[i][1] - y) <= reach ? i : -1;
    };
    /** Put the hovered point back to rest and hide its tooltip. */
    const release = () => {
        if (hovered >= 0) handlers.leave(marks[hovered], data[hovered]);
        hovered = -1;
        root.style.cursor = '';
    };
    nearestReleases.set(root, release);
    /** @param {number} i - The point now under the pointer, -1 for none. */
    const hover = (i) => {
        if (i === hovered) return;
        release();
        if (i < 0) return;
        hovered = i;
        handlers.enter(marks[i], data[i]);
        root.style.cursor = handlers.cursor ?? '';
    };

    surface
        .on('pointermove.nearest', (/** @type {PointerEvent} */ event) =>
            hover(suspended() ? -1 : nearest(event)),
        )
        .on('pointerleave.nearest', () => hover(-1))
        .on('pointerdown.nearest', (/** @type {PointerEvent} */ event) => {
            downAt = [event.clientX, event.clientY];
            // A mouse hovered on its way here; a finger or pen arrives with the press.
            if (event.pointerType !== 'mouse') hover(nearest(event));
        })
        .on('click.nearest', (/** @type {MouseEvent} */ event) => {
            const start = downAt;
            downAt = null;
            const travel = start
                ? Math.hypot(event.clientX - start[0], event.clientY - start[1])
                : 0;
            if (travel > MARK_DEFAULTS.dragThresholdPx) return;
            const i = nearest(event);
            if (i < 0 || !handlers.click) return;
            handlers.click(marks[i], data[i], event);
            // The press hid the tooltip and may have repainted the point's resting look
            // (a marquee began); enter it again, so its tooltip and look follow the click.
            if (hovered === i) handlers.enter(marks[i], data[i]);
            else hover(i);
        });
}
