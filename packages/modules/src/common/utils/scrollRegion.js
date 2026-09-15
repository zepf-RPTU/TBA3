/**
 * Keyboard access for a container that scrolls its own content.
 *
 * A scroll container is reachable by the mouse wheel but not by the keyboard until it
 * is in the tab order, and once it is, it needs a name (the owning module's title) and a
 * visible focus ring (`.scroll-region:focus-visible` in foundation/interactive.css).
 * WCAG 2.1.1; axe `scrollable-region-focusable`.
 */

/** The class the focus rule keys on. */
const SCROLL_REGION_CLASS = 'scroll-region';

/**
 * Put `element` in the tab order as a named region.
 * @param {HTMLElement} element - The element whose overflow scrolls.
 * @param {HTMLElement|null} titleElement - The visible title that names the region; given an
 *     id when it has none. `null` leaves the region unnamed rather than pointing at nothing.
 */
export function markScrollRegion(element, titleElement) {
    element.classList.add(SCROLL_REGION_CLASS);
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'region');
    if (titleElement) {
        if (!titleElement.id) titleElement.id = `${element.id}-label`;
        element.setAttribute('aria-labelledby', titleElement.id);
    } else {
        element.removeAttribute('aria-labelledby');
    }
}

/**
 * Undo {@link markScrollRegion}.
 * @param {HTMLElement} element - The element that was marked.
 */
export function unmarkScrollRegion(element) {
    element.classList.remove(SCROLL_REGION_CLASS);
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-labelledby');
}

/**
 * The `.content-module-title` of the module card that contains `element`, if any.
 * @param {HTMLElement} element - An element inside a ContentModule.
 * @returns {HTMLElement|null} The title element, or `null` when the module renders none.
 */
export function findOwningModuleTitle(element) {
    return element.closest('.module-container')?.querySelector('.content-module-title') ?? null;
}
