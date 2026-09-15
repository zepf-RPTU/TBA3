/**
 * Modal dialog mechanics for the overlays that cover the page: the dialog role,
 * an inert page behind it, and focus that moves in on open and back to the
 * trigger on close. One implementation, composed by SingletonOverlay (item
 * preview) and called directly by the overlays that manage their own root
 * (SL detail overlay, EN scatterplot filter). The tour is not a modal — its
 * spotlighted element must stay interactive — so it does not use this.
 *
 * `inert` rather than a keyboard trap: it removes the page from the tab order
 * *and* from the accessibility tree in one attribute, which is what a screen
 * reader needs to stay inside the dialog. Native `<dialog>.showModal()` would
 * give the same for free but puts the dialog in the top layer, above the
 * body-appended tooltips and glossary popups the overlays' charts rely on.
 */

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Open `root` as a modal dialog: stamp the role, make every other body child inert
 * (bar the tooltip layer and the toast region), and move focus to the first control inside it.
 * @param {HTMLElement} root - The overlay element, or one of its ancestors that is a body child.
 * @param {object} options - Dialog naming.
 * @param {string} options.label - Accessible name of the dialog.
 * @returns {() => void} Closes the dialog: lifts `inert` and returns focus to the element that had it.
 */
export function openModalDialog(root, { label }) {
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', label);

    const trigger = document.activeElement;
    // Only what this call makes inert is lifted again, so a nested or repeated open
    // cannot un-inert what an outer dialog still needs covered. The popup layer
    // (`role="tooltip"`, anchoredPopup.js) is skipped: it is body-appended but belongs
    // to whatever is hovered, so the dialog's own charts raise their tooltips into it —
    // inert would stop those from hit-testing and the interactive ones from being
    // entered. It carries no focusable content and is already `aria-hidden`.
    const covered = Array.from(document.body.children).filter(
        (el) =>
            el !== root &&
            !el.contains(root) &&
            !el.matches('[role="tooltip"], .toast-region') &&
            !(/** @type {HTMLElement} */ (el).inert),
    );
    covered.forEach((el) => {
        /** @type {HTMLElement} */ (el).inert = true;
    });

    const first = /** @type {HTMLElement | null} */ (root.querySelector(FOCUSABLE));
    const focusedRoot = !first;
    if (first) {
        first.focus({ preventScroll: true });
    } else {
        root.tabIndex = -1;
        root.focus({ preventScroll: true });
    }

    return () => {
        covered.forEach((el) => {
            /** @type {HTMLElement} */ (el).inert = false;
        });
        // Drop the programmatic tab stop again — a closed backdrop must not stay one.
        if (focusedRoot) root.removeAttribute('tabindex');
        if (trigger instanceof HTMLElement && trigger.isConnected) {
            trigger.focus({ preventScroll: true });
        }
    };
}
