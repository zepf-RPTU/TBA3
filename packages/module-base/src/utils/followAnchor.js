/**
 * followAnchor — keep a floating element (a popover, a menu) at its anchor while the
 * page moves under it: Floating UI's `autoUpdate` + `computePosition`, flipped to the
 * other side when the placement does not fit, kept inside the viewport. `strategy:
 * 'fixed'`: a popover's containing block in the top layer is the viewport. With
 * `capHeight`, the height left between the placed side and the viewport edge lands in
 * `--floating-available-height`, so a scrolling menu can grow to the viewport and no
 * further.
 */

import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';

/** Minimum distance the floating element keeps from the viewport edges. */
const VIEWPORT_PADDING_PX = 8;

/**
 * @typedef {object} FollowAnchorOptions
 * @property {import('@floating-ui/dom').Placement} placement - Where it opens against the anchor.
 * @property {number} gapPx - Space between the anchor's edge and the floating element.
 * @property {boolean} [crossAxis] - Also shift along the placement's side to stay in the viewport.
 * @property {boolean} [capHeight] - Write the height left to the viewport edge to `--floating-available-height`, for an element whose CSS caps itself by it.
 * @property {() => boolean} [isActive] - Checked before each placement; false ends the following.
 * @property {(placement: import('@floating-ui/dom').Placement) => void} [onPlaced] - Receives the placement used, after a flip.
 */

/**
 * Place `floating` at `anchor` now and again on every scroll, resize or layout change
 * of either, until the returned stop is called.
 * @param {Element} anchor
 * @param {HTMLElement} floating - The fixed-position element placed at it.
 * @param {FollowAnchorOptions} options
 * @returns {() => void} Stops the following; calling it twice is harmless.
 */
export function followAnchor(
    anchor,
    floating,
    { placement, gapPx, crossAxis = false, capHeight = false, isActive, onPlaced },
) {
    /** @type {(() => void) | undefined} */
    let stopUpdates;
    let stopped = false;
    const stop = () => {
        stopped = true;
        stopUpdates?.();
    };
    const middleware = [
        offset(gapPx),
        flip({ padding: VIEWPORT_PADDING_PX }),
        shift({ padding: VIEWPORT_PADDING_PX, crossAxis }),
    ];
    if (capHeight) {
        // Rounded and written only on change: every write invalidates the menu's style,
        // and `size` reads the menu's dimensions right after, which would force a layout
        // per scroll frame. The cap a previous following left is dropped first: `flip`
        // measures the element as capped, and a stale cap would make a cramped side look
        // like it fits.
        let availableHeight = -1;
        floating.style.removeProperty('--floating-available-height');
        middleware.push(
            size({
                padding: VIEWPORT_PADDING_PX,
                apply({ availableHeight: measured }) {
                    const height = Math.floor(measured);
                    if (height === availableHeight) return;
                    availableHeight = height;
                    floating.style.setProperty('--floating-available-height', `${height}px`);
                },
            }),
        );
    }
    // `autoUpdate` runs the first placement synchronously, before `stopUpdates` is
    // assigned: a menu filled in `beforetoggle` is not open yet, so that one only skips.
    stopUpdates = autoUpdate(anchor, floating, async () => {
        if (isActive && !isActive()) {
            stopUpdates?.();
            return;
        }
        const placed = await computePosition(anchor, floating, {
            placement,
            strategy: 'fixed',
            middleware,
        });
        // A placement still computing when the following stopped belongs to the old
        // anchor; the element may already be hidden or following another one.
        if (stopped) return;
        floating.style.left = `${placed.x}px`;
        floating.style.top = `${placed.y}px`;
        onPlaced?.(placed.placement);
    });
    return stop;
}
