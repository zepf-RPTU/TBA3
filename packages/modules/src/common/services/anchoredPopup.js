/**
 * The element-anchored popup primitive: a popover that opens in the top layer below (or above) an anchor
 * element, stays there while the page moves under it, and is removed once its hide
 * transition has run. Stateless DOM helpers; the timers, the
 * listeners and which popup is open are the caller's. Placement is Floating UI's.
 */

import { followAnchor } from '@tba3/module-base';
import { render } from 'lit';

/** Space between the anchor's edge and the popup; tooltipService.css bridges it. */
const POPUP_GAP_PX = 6;

/** @type {WeakMap<HTMLElement, () => void>} The shown popups' Floating UI `autoUpdate` cleanups. */
const positioning = new WeakMap();

/**
 * Create an element-anchored popup (delegated tooltip or glossary popup), appended to
 * `document.body` and not yet shown.
 * @param {object} config
 * @param {string} config.className - Class that selects the popup variant.
 * @param {'manual'|'hint'} config.popover - `manual` for a glossary popup (`tooltipService`
 *   dismisses it, and opening one closes no menu); `hint` for a label, which never
 *   closes an open menu or glossary popup.
 * @param {string|null} [config.id] - Element id, when the popup has to be findable again.
 * @returns {HTMLDivElement}
 */
export function createAnchoredPopupElement({
    className,
    popover,
    id = /** @type {string|null} */ (null),
}) {
    const popup = document.createElement('div');
    popup.className = className;
    if (id) {
        popup.id = id;
    }
    popup.popover = popover;
    popup.setAttribute('role', 'tooltip');
    document.body.appendChild(popup);
    return popup;
}

/**
 * Fill, place and show a popup at an anchor element; a popup already shown moves to
 * the new anchor but keeps the invoker it was shown with (hide it first to change that). The content is rendered with lit-html, which owns the popup's
 * children: a re-show patches them. Inside an open modal `<dialog>` everything outside
 * the dialog is inert, so the popup moves into the anchor's dialog, where its terms and
 * buttons stay reachable, and back to `<body>` otherwise; moving a shown popover hides
 * it, so it is shown again after.
 * @param {HTMLElement} popup
 * @param {Element} anchorElement - The element it points at: an HTML element or an SVG one
 *   (a term in a chart label).
 * @param {unknown} content - What it shows: anything lit-html renders — text, a template, `trusted(markup)`.
 * @param {{interactive?: boolean}} [options] - Whether the cursor may travel into it (the `is-interactive` class).
 */
export function showAnchoredPopup(popup, anchorElement, content, options = {}) {
    const { interactive = false } = options;

    popup.classList.toggle('is-interactive', interactive);
    render(content, popup);

    const host = anchorElement.closest('dialog') ?? document.body;
    if (popup.parentElement !== host) host.append(popup);
    // An HTML anchor is the popover's `source`, its invoker: the popup follows it in focus
    // order and popover nesting (it sets no ARIA link). `source` takes no SVG element,
    // and showPopover throws on one.
    if (!popup.matches(':popover-open')) {
        popup.showPopover(anchorElement instanceof HTMLElement ? { source: anchorElement } : {});
    }

    // Measured at the origin, so the popup has its shrink-to-fit width, not one its
    // previous position squeezed against the viewport edge.
    positioning.get(popup)?.();
    popup.style.left = '0px';
    popup.style.top = '0px';
    // Below the anchor, above when below does not fit. Floating UI resolves within
    // microtasks, so the popup is placed before the next paint.
    positioning.set(
        popup,
        followAnchor(anchorElement, popup, {
            placement: 'bottom',
            gapPx: POPUP_GAP_PX,
            crossAxis: true,
            onPlaced: (placement) => {
                popup.dataset.placement = placement === 'top' ? 'above' : 'below';
            },
        }),
    );
}

/**
 * Hide a popup and stop following its anchor; a missing or hidden popup is a no-op.
 * @param {HTMLElement|null} popup
 */
export function hideAnchoredPopup(popup) {
    if (!popup) return;
    stopFollowingAnchor(popup);
    if (popup.matches(':popover-open')) popup.hidePopover();
}

/**
 * Stop placing a popup at its anchor: for one the browser has closed itself (light
 * dismiss, Escape) as much as for one being hidden.
 * @param {HTMLElement} popup
 */
export function stopFollowingAnchor(popup) {
    positioning.get(popup)?.();
    positioning.delete(popup);
}

/**
 * Remove a hidden popup from the DOM once its fade-out has run: at once when no
 * fade runs (reduced motion) and also when the fade is cancelled.
 * @param {HTMLElement} popup - The popup, just hidden.
 * @param {{subtree?: boolean}} [options] - `subtree: true` also waits for its descendants' transitions.
 */
export function removePopupAfterTransition(popup, { subtree = false } = {}) {
    void Promise.allSettled(
        popup.getAnimations({ subtree }).map((animation) => animation.finished),
    ).then(() => popup.remove());
}
