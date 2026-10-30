/**
 * View skeleton placeholders — shown while a view is imported and rendered. The
 * placeholder sits in the view's shell beside its container, in the same grid cell
 * (view-layout.css), so it covers the container without a measurement; it is not a
 * child, because every view rebuilds its container's content. Showing and hiding are
 * idempotent, so the app (lazy import) and the view (`beginViewRender()`) can each
 * assert it. Styling lives in src/styles/skeleton.css.
 */

import { createElement } from '@tba3/module-base';

/** @typedef {'stack'|'rows'|'split'|'split-wide'|'triple'|'grid'} ViewSkeletonShape */

/** @type {Record<ViewSkeletonShape, number>} Number of placeholder cards drawn per shape. */
const SHAPE_CARD_COUNT = {
    stack: 1,
    rows: 2,
    split: 2,
    'split-wide': 2,
    triple: 3,
    grid: 4,
};

/**
 * Delay before a skeleton starts fading in. Must match the `animation-delay`
 * on .view-skeleton / .app-skeleton in src/styles/skeleton.css.
 */
const APPEAR_DELAY_MS = 150;

/**
 * How long a skeleton stays up once it has begun appearing. Must stay ≥ the
 * 200 ms `skeleton-appear` fade-in in src/styles/skeleton.css, so the placeholder
 * is fully opaque before it goes, and no longer: anything above it is pure hold on
 * every first render that outlasts the appear delay.
 */
const MIN_VISIBLE_MS = 200;

/**
 * How long to wait before removing a skeleton mounted for `elapsedMs`, so it is
 * either never seen or fully faded in, not a flicker.
 * @param {number} elapsedMs - Time the placeholder has been mounted
 * @returns {number} Milliseconds to wait; 0 to remove immediately
 */
export function skeletonHoldDelay(elapsedMs) {
    // Still inside the anti-flash window — it never painted, drop it at once.
    if (elapsedMs < APPEAR_DELAY_MS) return 0;
    return Math.max(0, APPEAR_DELAY_MS + MIN_VISIBLE_MS - elapsedMs);
}

/**
 * Mount a placeholder over a view container, in its shell. Reuses one already
 * mounted there; mounts none when the container is not in the DOM.
 * @param {HTMLElement|null} viewContainer
 * @param {ViewSkeletonShape} [shape] - Layout shape; a view created outside an app has none and shows 'stack'
 * @returns {HTMLElement|null} The overlay over the container, or null when it is not in the DOM.
 */
export function showViewSkeleton(viewContainer, shape = 'stack') {
    const shell = viewContainer?.parentElement;
    if (!shell) return null;

    // Recreating a mounted one would restart its fade-in animation.
    const mounted = findSkeleton(viewContainer);
    if (mounted) return mounted;

    const cards = Array.from({ length: SHAPE_CARD_COUNT[shape] }, () =>
        createElement('div', { className: 'skeleton-card' }),
    );

    const overlay = createElement(
        'div',
        {
            className: `view-skeleton view-skeleton--${shape}`,
            attributes: { 'aria-hidden': 'true' },
            dataset: { skeletonShownAt: String(Date.now()) },
        },
        cards,
    );

    shell.appendChild(overlay);
    return overlay;
}

/**
 * Wait out the remainder of a mounted placeholder's minimum display time.
 *
 * Await this before uncovering the view: uncovering first shows the finished
 * content underneath a placeholder that is still fading in, which reads as a
 * flicker. Resolves immediately when there is no overlay or it never painted. The time is
 * read again after each wait: a revisit during it restarts the hold
 * (`restartSkeletonHold`).
 * @param {HTMLElement|null} viewContainer
 * @returns {Promise<void>}
 */
export async function waitForSkeletonHold(viewContainer) {
    for (;;) {
        const overlay = findSkeleton(viewContainer);
        if (!overlay) return;

        const shownAt = Number(overlay.dataset.skeletonShownAt) || 0;
        const wait = skeletonHoldDelay(Date.now() - shownAt);
        if (wait === 0) return;

        await new Promise((resolve) => {
            setTimeout(resolve, wait);
        });
    }
}

/**
 * Count a mounted placeholder's display time from now. A shell hidden with
 * `display: none` stops the placeholder's fade-in, and showing the shell again starts it
 * over, so the hold of a placeholder kept through a hide counts from the show.
 * @param {HTMLElement|null} viewContainer
 */
export function restartSkeletonHold(viewContainer) {
    const overlay = findSkeleton(viewContainer);
    if (overlay) overlay.dataset.skeletonShownAt = String(Date.now());
}

/**
 * Remove the placeholder mounted for a view container, if any.
 *
 * Always immediate: the minimum-display hold belongs to waitForSkeletonHold().
 * @param {HTMLElement|null} viewContainer
 * @returns {void}
 */
export function hideViewSkeleton(viewContainer) {
    if (!viewContainer) return;
    findSkeleton(viewContainer)?.remove();
}

/**
 * The overlay in a view container's shell.
 * @param {HTMLElement|null} viewContainer
 * @returns {HTMLElement|null} The overlay, or null when the view has none mounted.
 * @private
 */
function findSkeleton(viewContainer) {
    return viewContainer?.parentElement?.querySelector(':scope > .view-skeleton') ?? null;
}
