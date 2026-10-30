/**
 * Chart motion: the shared durations, the easing, and the reduced-motion preference.
 *
 * D3 SVG transitions animate attributes via requestAnimationFrame, so a CSS
 * `@media (prefers-reduced-motion)` rule cannot stop them: every chart transition goes
 * through `animate()` or wraps its duration in `motionDuration()`.
 * - A chain that only sets attributes or styles calls `animate()`, which hands back
 *   the bare selection when there is nothing to animate.
 * - A chain that needs `.on('end')`, `.remove()`, `attrTween` or a shared
 *   `d3.transition()` builds the transition itself:
 *   `.transition(name).duration(motionDuration(ms)).ease(MOTION_EASE)`. A duration of
 *   0 runs it instantly while keeping that machinery intact.
 *
 * Either way the duration is resolved once, at the leaf that starts the transition;
 * code passing a duration along leaves it unresolved.
 */

import * as d3 from 'd3';

/**
 * Chart durations. module-base's `tokens.css` mirrors FAST and BASE as `--motion-duration-*` for
 * the CSS transitions, and a unit test keeps them equal; SLOW (the zoom) is the charts' alone.
 */
export const MOTION = Object.freeze({
    /** Hover feedback and fades. */
    FAST_MS: 150,
    /** Layout and data changes. */
    BASE_MS: 300,
    /** Zoom. */
    SLOW_MS: 750,
});

/** The one chart easing; `--motion-ease-standard` is its CSS counterpart. */
export const MOTION_EASE = d3.easeCubic;

/** @type {MediaQueryList|null} Cached query object; `.matches` stays live. */
let _query = null;

/**
 * Whether the user has requested reduced motion at the OS level.
 * @returns {boolean}
 */
function prefersReducedMotion() {
    if (_query === null) {
        _query = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return _query.matches;
}

/**
 * Resolve an animation duration, collapsing it to 0 (instant) under reduced motion.
 * @param {number} durationMs
 * @returns {number}
 */
export function motionDuration(durationMs) {
    return prefersReducedMotion() ? 0 : durationMs;
}

/**
 * Start an eased transition on `selection`, or return the selection itself when the
 * resolved duration is 0 (asked for, or forced by reduced motion). Both chain the same
 * `.attr()`/`.style()` calls, so the caller writes its end state once.
 * @template {import('d3').Selection<any, any, any, any>} S
 * @param {S} selection
 * @param {{durationMs?: number, name?: string}} [options] - `name` is the transition
 *   name, so a matching `interrupt(name)` cancels only it.
 * @returns {S} The transition, or the selection when instant. Typed as the selection:
 *   the transition takes the same `.attr()`/`.style()`/`.call()` chain, which is all a
 *   caller of this may use.
 */
export function animate(selection, { durationMs = MOTION.BASE_MS, name } = {}) {
    const resolved = motionDuration(durationMs);
    if (resolved === 0) return selection;
    return /** @type {any} */ (selection.transition(name).duration(resolved).ease(MOTION_EASE));
}

/**
 * The inline pointer-events each leaving mark had before `leave` took it off the pointer,
 * for `takeBack` to restore: `''` for a hit target, `'none'` for a label that never was one.
 * @type {WeakMap<Element, string>}
 */
const pointerEventsBeforeLeaving = new WeakMap();

/**
 * The start of a keyed join's exit: the leaving marks drop off the pointer and the
 * keyboard at once (a fading mark must not keep the chart's tab stop into its removal;
 * `isMarkShown` reads the inline pointer-events). What each had is kept for `takeBack`.
 * @template {import('d3').Selection<any, any, any, any>} S
 * @param {S} exit
 * @returns {S} The same selection, for the exit's transition.
 */
export function leave(exit) {
    exit.each(function () {
        // A mark already leaving keeps what it had before the first exit.
        if (!pointerEventsBeforeLeaving.has(this)) {
            pointerEventsBeforeLeaving.set(this, this.style.pointerEvents);
        }
    });
    return exit.style('pointer-events', 'none');
}

/**
 * The exit of a keyed join: the leaving marks drop off the pointer and the keyboard at
 * once (`leave`), then fade out on the named transition and go.
 * @param {import('d3').Selection<any, any, any, any>} exit
 * @param {string} name - The transition name, so a `takeBack(update, name)` on re-entry cancels it.
 * @param {number} durationMs - The fade, resolved here (`motionDuration`).
 * @returns {import('d3').Transition<any, any, any, any>}
 */
export function fadeOutAndRemove(exit, name, durationMs) {
    return leave(exit)
        .transition(name)
        .duration(motionDuration(durationMs))
        .ease(MOTION_EASE)
        .style('opacity', 0)
        .remove();
}

/**
 * The partner of `leave`, for a keyed join's update: a mark caught leaving stops its
 * fade and removal and gets back the pointer-events it had, so a hit target takes the
 * pointer and the keyboard again and a label stays off them. A mark that was not leaving
 * is left as it is. Its opacity stays the caller's, restored at once or animated back.
 * @template {import('d3').Selection<any, any, any, any>} S
 * @param {S} update
 * @param {string} name - The exit's transition name.
 * @returns {S} The same selection, for the caller's chain.
 */
export function takeBack(update, name) {
    update.interrupt(name).each(function () {
        const before = pointerEventsBeforeLeaving.get(this);
        if (before === undefined) return;
        pointerEventsBeforeLeaving.delete(this);
        this.style.pointerEvents = before;
    });
    return update;
}
