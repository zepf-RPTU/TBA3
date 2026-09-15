/**
 * View skeleton placeholders — shown while a view is imported and rendered.
 *
 * The overlay is a sibling of the view container, not a child of it: every
 * view rebuilds `container.innerHTML` in its own DOM step, which runs after
 * `beginViewRender()`, so a child would be wiped. It is absolutely positioned
 * rather than in flow because during the render window the view container
 * still occupies its full height (view-layout.css hides it with
 * `visibility: hidden`), and an in-flow placeholder would double the page.
 *
 * Both functions are idempotent. That is what lets the app mount the skeleton
 * for the lazy-import window and the view re-assert it in `beginViewRender()`
 * without either side tracking the other's state.
 *
 * Styling lives in src/styles/skeleton.css.
 */

import { createElement, resizeService } from '@tba3/module-base';

/** Number of placeholder cards drawn per shape. */
const SHAPE_CARD_COUNT = {
    stack: 1,
    rows: 2,
    split: 2,
    triple: 3,
    grid: 4,
};

const DEFAULT_SHAPE = 'stack';

/**
 * Scope under which overlays register their resize observation. The observation
 * is keyed by the view container (one overlay per container), so
 * hideViewSkeleton() unobserves that container; the scope is the sweep handle
 * for anything that outlives its overlay.
 */
const SKELETON_RESIZE_SCOPE = 'view-skeleton';

/**
 * Delay before a skeleton starts fading in. Must match the `animation-delay`
 * on .view-skeleton / .app-skeleton in src/styles/skeleton.css.
 */
const APPEAR_DELAY_MS = 150;

/**
 * How long a skeleton stays up once it has begun appearing. The CSS fade-in runs
 * 200 ms after the 150 ms delay, so 200 is the floor: it guarantees the placeholder
 * is fully opaque before it goes (no half-faded ghost) and nothing more — the
 * previous 350 added ~150 ms of pure hold to every first render that took longer
 * than 150 ms.
 * Must stay ≥ the `skeleton-appear` duration in src/styles/skeleton.css.
 */
const MIN_VISIBLE_MS = 200;

/**
 * How long to wait before removing a skeleton that has been mounted for
 * `elapsedMs`, so it is either never seen at all or seen properly — never a
 * half-faded ghost that reads as a flicker.
 *
 * Shared with bootstrapDashboardApp.js, which applies the same rule to the
 * cold-start shell, so the two placeholders behave identically.
 * @param {number} elapsedMs - Time the placeholder has been mounted
 * @returns {number} Milliseconds to wait; 0 to remove immediately
 */
export function skeletonHoldDelay(elapsedMs) {
    // Still inside the anti-flash window — it never painted, drop it at once.
    if (elapsedMs < APPEAR_DELAY_MS) return 0;
    return Math.max(0, APPEAR_DELAY_MS + MIN_VISIBLE_MS - elapsedMs);
}

/**
 * Mount a placeholder over a view container. No-op if one is already mounted
 * for that container, or if the container is not in the DOM. The container's
 * id is what pairs the two, so a container without one is skipped — every view
 * container appModule creates has one (ViewConfigEntry.containerId).
 * @param {HTMLElement|null} viewContainer - The view's own container element
 * @param {string} [shape] - Layout shape key; unknown values fall back to 'stack'
 * @returns {void}
 */
export function showViewSkeleton(viewContainer, shape = DEFAULT_SHAPE) {
    const parent = viewContainer?.parentElement;
    if (!viewContainer?.id || !parent) return;

    // Already mounted (the app put one up for the lazy-import window and the
    // view is now re-asserting it in beginViewRender). Reuse it — recreating
    // would restart the fade-in animation from zero — but re-measure it: the
    // shared header renders per view, so the slot the overlay has to cover can
    // have moved between the two calls.
    const existing = findSkeleton(viewContainer);
    if (existing) {
        positionSkeleton(existing, viewContainer);
        return;
    }

    const resolvedShape = shape in SHAPE_CARD_COUNT ? shape : DEFAULT_SHAPE;
    const cards = Array.from({ length: SHAPE_CARD_COUNT[resolvedShape] }, () =>
        createElement('div', { className: 'skeleton-card' }),
    );

    const overlay = createElement(
        'div',
        {
            className: `view-skeleton view-skeleton--${resolvedShape}`,
            attributes: { 'aria-hidden': 'true' },
            dataset: { skeletonFor: viewContainer.id, skeletonShownAt: String(Date.now()) },
        },
        cards,
    );

    positionSkeleton(overlay, viewContainer);
    parent.appendChild(overlay);

    // Keep the overlay aligned with the slot it covers — positionSkeleton()
    // only measures once at mount, but the container can be resized underneath
    // it (a window resize during a long import; SL's content-height views
    // growing as their DOM builds). Removed again in hideViewSkeleton().
    resizeService.observe(viewContainer, () => positionSkeleton(overlay, viewContainer), {
        scopeId: SKELETON_RESIZE_SCOPE,
    });
}

/**
 * Anchor an overlay to the view's slot in .main-content (which is
 * position: relative via foundation/layout-reset.css). offsetTop is the
 * header's height in both windows we cover. Prefer the container's own height
 * when it has one so we do not cover sibling chrome appended after the view
 * (SL's nav).
 *
 * Safe to re-run on a mounted overlay — that is how a placeholder mounted
 * before an awaited header update stays aligned afterwards.
 * @param {HTMLElement} overlay - The placeholder to align.
 * @param {HTMLElement} viewContainer - The view’s own container element.
 * @returns {void}
 * @private
 */
function positionSkeleton(overlay, viewContainer) {
    overlay.style.top = `${viewContainer.offsetTop}px`;
    if (viewContainer.offsetHeight > 0) {
        overlay.style.height = `${viewContainer.offsetHeight}px`;
        overlay.style.bottom = '';
    } else {
        overlay.style.height = '';
        overlay.style.bottom = '0';
    }
}

/**
 * Wait out the remainder of a mounted placeholder's minimum display time.
 *
 * Callers must await this **before** uncovering the view. Uncovering first and
 * removing the overlay afterwards shows the finished content underneath a
 * placeholder that is still fading in — which reads as a flicker.
 *
 * Resolves immediately when there is no overlay, or when the render beat the
 * anti-flash delay so the overlay never painted.
 * @param {HTMLElement|null} viewContainer - The view’s own container element.
 * @returns {Promise<void>}
 */
export function waitForSkeletonHold(viewContainer) {
    const overlay = findSkeleton(viewContainer);
    if (!overlay) return Promise.resolve();

    const shownAt = Number(overlay.dataset.skeletonShownAt) || 0;
    const wait = skeletonHoldDelay(Date.now() - shownAt);
    if (wait === 0) return Promise.resolve();

    return new Promise((resolve) => {
        setTimeout(resolve, wait);
    });
}

/**
 * Remove the placeholder mounted for a view container, if any.
 *
 * Always immediate: the minimum-display hold belongs to waitForSkeletonHold(),
 * so that the uncover and the removal can happen in the same task and produce a
 * single paint.
 * @param {HTMLElement|null} viewContainer - The view’s own container element.
 * @returns {void}
 */
export function hideViewSkeleton(viewContainer) {
    if (!viewContainer) return;
    const overlay = findSkeleton(viewContainer);
    if (!overlay) return;
    resizeService.unobserve(viewContainer);
    overlay.remove();
}

/**
 * Find the overlay paired with a view container.
 *
 * Scans siblings rather than building an attribute selector: container ids are
 * author-supplied, and CSS.escape is not available in every environment we run
 * in (notably the jsdom used by the unit tests).
 * @param {HTMLElement|null} viewContainer - The view’s own container element.
 * @returns {HTMLElement|null} The paired overlay, or null when the view has none mounted.
 * @private
 */
function findSkeleton(viewContainer) {
    const parent = viewContainer?.parentElement;
    if (!viewContainer?.id || !parent) return null;
    const match = Array.from(parent.children).find(
        (child) => /** @type {HTMLElement} */ (child).dataset?.skeletonFor === viewContainer.id,
    );
    return /** @type {HTMLElement|null} */ (match ?? null);
}
