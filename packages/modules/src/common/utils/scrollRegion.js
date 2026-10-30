/**
 * Keyboard access for a container that scrolls its own content.
 *
 * A scroll container is reachable by the mouse wheel but not by the keyboard until it
 * is in the tab order, and once it is, it needs a name (the owning module's title) and a
 * visible focus ring (scrollRegion.css).
 * WCAG 2.1.1; axe `scrollable-region-focusable`.
 */

import { ContentModule, owningModuleId } from '@tba3/module-base';
import './scrollRegion.css';

/** The class the focus rule keys on. */
const SCROLL_REGION_CLASS = 'scroll-region';

/**
 * Put `element` in the tab order as a named region.
 * @param {HTMLElement} element - The element whose overflow scrolls.
 * @param {HTMLElement|null} titleElement - The visible title that names the region; given an
 *     id when it has none. `null` leaves the region unnamed.
 */
export function markScrollRegion(element, titleElement) {
    element.classList.add(SCROLL_REGION_CLASS);
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'region');
    labelByTitle(element, titleElement);
}

/**
 * Mark `element` as a scroll region while it scrolls, and only then: a region with
 * nothing to scroll would be a Tab stop that does nothing.
 * @param {HTMLElement} element - The element whose overflow may scroll.
 * @param {boolean} scrolls - Whether its content overflows it now.
 * @param {HTMLElement|null} titleElement - The visible title that names the region.
 */
export function syncScrollRegion(element, scrolls, titleElement) {
    if (scrolls) markScrollRegion(element, titleElement);
    else unmarkScrollRegion(element);
}

/**
 * Name `element` by a visible title through `aria-labelledby`, so the name follows the
 * title when it changes.
 * @param {Element} element - The element to name; its id (or its module's) seeds the title's when the title has none.
 * @param {Element|null} titleElement - The title, given an id when it has none. `null`
 *     drops the reference.
 */
export function labelByTitle(element, titleElement) {
    if (titleElement) {
        if (!titleElement.id) titleElement.id = `${owningModuleId(element)}-label`;
        element.setAttribute('aria-labelledby', titleElement.id);
    } else {
        element.removeAttribute('aria-labelledby');
    }
}

/**
 * Undo {@link markScrollRegion}.
 * @param {HTMLElement} element
 */
export function unmarkScrollRegion(element) {
    element.classList.remove(SCROLL_REGION_CLASS);
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-labelledby');
}

/**
 * The nearest card around `element`, itself included, that renders a title: a card
 * sitting flat in another (no title of its own) belongs to the outer card.
 * @param {Element} element - An element inside a ContentModule.
 * @returns {ContentModule<any>|null} The card, or `null` when no card around it renders a title.
 */
export function findOwningCard(element) {
    for (let node = /** @type {Element|null} */ (element); node; node = node.parentElement) {
        if (node instanceof ContentModule && node.titleElement) return node;
    }
    return null;
}

/**
 * The title of the card `findOwningCard` finds.
 * @param {Element} element - An element inside a ContentModule.
 * @returns {HTMLElement|null} The title element, or `null` when no card around it renders one.
 */
export function findOwningModuleTitle(element) {
    return findOwningCard(element)?.titleElement ?? null;
}
