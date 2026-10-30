/**
 * Pointer gestures of the notes drawer: free-drag by its header and free-resize by its
 * bottom-right grip. Both capture the pointer on their handle, so move/up events keep
 * arriving even if the pointer leaves the window mid-gesture. Each has a single-click
 * counterpart for the header buttons (WCAG 2.5.7): docking on the other side, and
 * stepping through three sizes.
 */

/**
 * Follow one pointer from its `pointerdown` until it is released or cancelled.
 * @param {HTMLElement} handle - The element the gesture started on; it captures the pointer.
 * @param {PointerEvent} downEvent - The `pointerdown` that starts the gesture.
 * @param {(dx: number, dy: number) => void} onMove - Called with the offset from the start point.
 */
function trackPointer(handle, downEvent, onMove) {
    const { clientX: startX, clientY: startY, pointerId } = downEvent;
    const tracking = new AbortController();
    const end = () => {
        handle.releasePointerCapture(pointerId);
        tracking.abort();
    };
    handle.setPointerCapture(pointerId);
    handle.addEventListener('pointermove', (e) => onMove(e.clientX - startX, e.clientY - startY), {
        signal: tracking.signal,
    });
    handle.addEventListener('pointerup', end, { signal: tracking.signal });
    handle.addEventListener('pointercancel', end, { signal: tracking.signal });
}

/**
 * Place the drawer at a viewport position, clamped so it stays fully on screen.
 * @param {HTMLElement} root
 * @param {number} x - Wanted left edge.
 * @param {number} y - Wanted top edge.
 */
function placeWithinViewport(root, x, y) {
    const maxX = Math.max(window.innerWidth - root.offsetWidth, 0);
    const maxY = Math.max(window.innerHeight - root.offsetHeight, 0);
    root.style.right = 'auto';
    root.style.left = `${Math.min(Math.max(x, 0), maxX)}px`;
    root.style.top = `${Math.min(Math.max(y, 0), maxY)}px`;
}

/**
 * Pull a dragged drawer back on screen, after the window shrank. A drawer never
 * dragged keeps its CSS anchoring, which follows the window by itself.
 * @param {HTMLElement} root
 */
export function keepWithinViewport(root) {
    if (!root.style.left) return;
    placeWithinViewport(root, root.offsetLeft, root.offsetTop);
}

/**
 * Free-drag the drawer via its header handle with the primary button, clamped to
 * the viewport. The position persists on the DOM node for the rest of the page
 * session, since the drawer is hidden, not destroyed, on close.
 * @param {HTMLElement} handle - The header area the drawer is dragged by.
 * @param {HTMLElement} root - The drawer element being moved.
 */
export function wireDrag(handle, root) {
    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || /** @type {HTMLElement} */ (e.target).closest('button')) return;
        const { left, top } = root.getBoundingClientRect();
        trackPointer(handle, e, (dx, dy) => placeWithinViewport(root, left + dx, top + dy));
    });
}

/**
 * Free-resize the drawer via a bottom-right handle. CSS min/max-width/height on
 * `.notes-drawer` clamp the visible result, so the handler tracks the raw pointer
 * offset.
 * @param {HTMLElement} handle - The bottom-right grip the drawer is resized by.
 * @param {HTMLElement} root - The drawer element being resized.
 */
export function wireResize(handle, root) {
    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // Pin to left/top so growing from this bottom-right handle tracks the cursor
        // even in the default right-anchored state.
        const rect = root.getBoundingClientRect();
        root.style.right = 'auto';
        root.style.left = `${rect.left}px`;
        root.style.top = `${rect.top}px`;
        trackPointer(handle, e, (dx, dy) => {
            root.style.width = `${rect.width + dx}px`;
            root.style.height = `${rect.height + dy}px`;
        });
    });
}

/**
 * Move the drawer to the other side of the window, keeping its top: the single-click
 * counterpart of dragging it.
 * @param {HTMLElement} root
 */
export function dockToOtherSide(root) {
    const { left, top, width } = root.getBoundingClientRect();
    const onRight = left + width / 2 > window.innerWidth / 2;
    placeWithinViewport(root, onRight ? 0 : window.innerWidth - width, top);
}

/**
 * Step the drawer to its next size of three, from its CSS minimum through the middle to
 * its maximum and round again: the single-click counterpart of the resize grip. The
 * sizes come from `.notes-drawer`'s min and max, so they follow the stylesheet.
 * @param {HTMLElement} root
 */
export function cycleSize(root) {
    const style = getComputedStyle(root);
    /** @type {(min: string, max: string) => number[]} */
    const steps = (min, max) => {
        const [low, high] = [Number.parseFloat(min), Number.parseFloat(max)];
        return [low, (low + high) / 2, high];
    };
    const widths = steps(style.minWidth, style.maxWidth);
    const heights = steps(style.minHeight, style.maxHeight);
    const { left, top, width } = root.getBoundingClientRect();
    // The first step wider than now; past the largest, the smallest.
    const next = Math.max(
        widths.findIndex((step) => step > width + 1),
        0,
    );
    root.style.width = `${widths[next]}px`;
    root.style.height = `${heights[next]}px`;
    placeWithinViewport(root, left, top);
}
