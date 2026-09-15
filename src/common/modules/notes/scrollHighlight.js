const HIGHLIGHT_CLASS = 'notes-highlight-flash';
const HIGHLIGHT_DURATION_MS = 1500;

/**
 * Scroll an element into view and briefly flash-highlight it (used by notes
 * module-link chips to point at the module they reference).
 * @param {HTMLElement|null|undefined} element - Target element to scroll to and highlight
 */
export function scrollToAndHighlight(element) {
    if (!element) return;

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    element.classList.remove(HIGHLIGHT_CLASS);
    // Force reflow so the animation restarts if the same element is clicked again quickly.
    void element.offsetWidth;
    element.classList.add(HIGHLIGHT_CLASS);

    setTimeout(() => {
        element.classList.remove(HIGHLIGHT_CLASS);
    }, HIGHLIGHT_DURATION_MS);
}
