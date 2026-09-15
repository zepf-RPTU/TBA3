/**
 * The element-anchored popup primitive the delegated tooltips and the glossary popups
 * are both built on: create a popup under `document.body`, place it below (or above)
 * an anchor element viewport-aware, fill it, show and hide it, and remove it once its
 * hide transition has run. Stateless DOM helpers; `tooltipService` owns the timers,
 * the listeners and which popup is open.
 */

import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';

/** Space between the anchor's edge and the popup, in px. */
const POPUP_GAP = 6;
/** Minimum distance the popup keeps from the viewport edges, in px. */
const VIEWPORT_PADDING = 8;

/**
 * Position a popup element below (or above) an anchor element, viewport-aware.
 * @param {HTMLElement} popup - The popup being placed.
 * @param {HTMLElement} anchorElement - Element the popup should point at.
 */
function positionAtElement(popup, anchorElement) {
    const anchorRect = anchorElement.getBoundingClientRect();

    popup.style.left = '-9999px';
    popup.style.top = '-9999px';
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';

    const popupRect = popup.getBoundingClientRect();
    const popupWidth = popupRect.width;
    const popupHeight = popupRect.height;

    popup.style.visibility = '';
    popup.style.display = '';

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const gap = POPUP_GAP;
    const padding = VIEWPORT_PADDING;

    let left = anchorRect.left + scrollX + anchorRect.width / 2 - popupWidth / 2;
    left = Math.max(padding + scrollX, left);
    left = Math.min(viewportWidth - popupWidth - padding + scrollX, left);

    let top = anchorRect.bottom + scrollY + gap;
    let placement = 'below';

    if (anchorRect.bottom + popupHeight + gap > viewportHeight) {
        top = anchorRect.top + scrollY - popupHeight - gap;
        placement = 'above';
    }

    top = Math.max(padding + scrollY, top);

    popup.setAttribute('data-placement', placement);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

/**
 * Create an element-anchored popup (delegated rich tooltip or glossary popup).
 * @param {object} config - Identity, styling and stacking of the popup.
 * @param {string} config.className - Class that selects the popup variant.
 * @param {string|null} [config.id] - Element id, when the popup has to be findable again.
 * @param {boolean} [config.interactive=false] - Let the cursor travel into the popup without dismissing it.
 * @param {object} [config.attributes] - Extra attributes set on the element.
 * @param {number|null} [config.zIndex] - Explicit stacking order, for nested glossary popups.
 * @returns {HTMLDivElement} The popup element, not yet attached to the document.
 */
export function createAnchoredPopupElement({
    className,
    id = /** @type {string|null} */ (null),
    interactive = false,
    attributes = {},
    zIndex = null,
}) {
    const popup = document.createElement('div');
    popup.className = className;
    if (interactive) {
        popup.classList.add('interactive');
    }
    if (id) {
        popup.id = id;
    }
    popup.style.position = 'absolute';
    popup.setAttribute('role', 'tooltip');
    popup.setAttribute('aria-hidden', 'true');
    if (zIndex != null) {
        popup.style.zIndex = String(zIndex);
    }
    Object.entries(attributes).forEach(([name, value]) => {
        popup.setAttribute(name, value);
    });
    document.body.appendChild(popup);
    return popup;
}

/**
 * Mark whether the cursor may travel into the popup without dismissing it.
 * @param {HTMLElement} popup - The popup.
 * @param {boolean} interactive - True keeps it open under the cursor.
 */
function setAnchoredPopupInteractivity(popup, interactive) {
    popup.classList.toggle('interactive', interactive);
}

/**
 * Fill an anchored popup with a resolved payload, optionally glossary-annotating it.
 * @param {HTMLElement} popup - The popup whose content is replaced.
 * @param {object} payload - Resolved content and mode from the trigger element.
 * @param {{ annotate?: boolean, excludeKeys?: Set<string> }} [options] - Whether to annotate, and which glossary terms to skip.
 */
function setAnchoredPopupContent(popup, payload, { annotate = false, excludeKeys } = {}) {
    if (payload.mode === 'text') {
        popup.textContent = payload.content;
        return;
    }
    popup.innerHTML = annotate
        ? glossaryAnnotator.annotateHTML(payload.content, excludeKeys)
        : payload.content;
}

/**
 * Show or hide the popup through its `visible` class and ARIA state.
 * @param {HTMLElement} popup - The popup.
 * @param {boolean} visible - Whether it is on screen.
 */
function setAnchoredPopupVisibility(popup, visible) {
    popup.classList.toggle('visible', visible);
    popup.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/**
 * Fill, place and reveal a popup at an anchor element.
 * @param {HTMLElement} popup - The popup.
 * @param {HTMLElement} anchorElement - The element it points at.
 * @param {{content: string, mode: string}} payload - What it shows.
 * @param {{annotate?: boolean, interactive?: boolean, excludeKeys?: Set<string>, deferVisibility?: boolean}} [options] - Annotation, interactivity, and whether to reveal on the next frame so the CSS transition runs.
 */
export function showAnchoredPopup(popup, anchorElement, payload, options = {}) {
    const { annotate = false, interactive = false, excludeKeys, deferVisibility = false } = options;

    setAnchoredPopupInteractivity(popup, interactive);
    setAnchoredPopupContent(popup, payload, { annotate, excludeKeys });
    positionAtElement(popup, anchorElement);

    if (deferVisibility) {
        requestAnimationFrame(() => {
            setAnchoredPopupVisibility(popup, true);
        });
        return;
    }

    setAnchoredPopupVisibility(popup, true);
}

/**
 * Hide a popup without a grace period; a missing popup is a no-op.
 * @param {HTMLElement|null} popup - The popup.
 */
export function hideAnchoredPopupImmediate(popup) {
    if (!popup) return;
    setAnchoredPopupVisibility(popup, false);
}

/**
 * Remove a popup from the DOM after its hide transition completes.
 * @param {HTMLElement} popup - The popup to remove once the transition ends.
 * @param {number} delay - Milliseconds to wait, matching the CSS transition.
 * @param {Set<number>} pendingTimeouts - Where the caller tracks the timer so a teardown can cancel it.
 */
export function removePopupAfterTransition(popup, delay, pendingTimeouts) {
    const parentNode = popup.parentNode;
    const timeoutId = setTimeout(() => {
        pendingTimeouts.delete(timeoutId);
        if (parentNode?.contains(popup)) {
            parentNode.removeChild(popup);
        }
    }, delay);
    pendingTimeouts.add(timeoutId);
}
