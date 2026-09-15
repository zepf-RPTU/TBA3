/**
 * Reduced-motion preference for chart animations.
 *
 * D3 SVG transitions animate attributes via requestAnimationFrame, not CSS
 * transitions, so a CSS `@media (prefers-reduced-motion)` rule cannot stop them —
 * the guard has to live in JS at the point a transition is created. Every chart
 * animation path funnels its duration through `motionDuration()` (or checks
 * `prefersReducedMotion()` on an animate flag), so honoring the OS setting is a
 * single shared read.
 *
 * A duration of 0 runs the transition instantly while keeping its machinery
 * (`.on('end')`, `.remove()`, interrupts) intact — this is the same instant path
 * charts already take on their initial render, so forcing it is safe.
 * @module motionPreference
 */

/** @type {MediaQueryList|null} Cached query object; `.matches` stays live. */
let _query = null;

/**
 * Whether the user has requested reduced motion at the OS level.
 * Cheap after the first call (the MediaQueryList is cached but read live, so a
 * mid-session OS change is still reflected). Returns false where `matchMedia`
 * is unavailable (e.g. jsdom under tests), matching the animations-on default.
 * @returns {boolean} True when the OS asks for reduced motion; false where `matchMedia` is unavailable.
 */
export function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    if (_query === null) {
        _query = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return _query.matches;
}

/**
 * Resolve an animation duration, collapsing it to 0 (instant) under reduced
 * motion. Wrap every `.duration(…)` argument — or the local duration source — so
 * the transition stays interrupt-safe but plays instantly.
 * @param {number} duration - The intended duration in ms.
 * @returns {number} `0` under reduced motion, otherwise `duration`.
 */
export function motionDuration(duration) {
    return prefersReducedMotion() ? 0 : duration;
}
