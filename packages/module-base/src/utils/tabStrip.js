/**
 * The ARIA half of the shared `.tab-strip` pattern; tabStrip.css beside it is the visual half.
 *
 * Two strips use it — the notes drawer's page tabs and EN's item-detail tabs — and both
 * render their tabs as HTML strings and replace the strip wholesale, so what is shared is
 * the attribute set and the keyboard contract, not a component. Selection is expressed by
 * `aria-selected` alone: the stylesheet paints off that attribute, so there is no second
 * class to keep in step.
 */

import './tabStrip.css';

/** The keys the roving focus responds to. */
const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * The attributes one tab needs, for interpolation into a tab strip's markup.
 *
 * Only the selected tab is in the tab order (roving `tabindex`): a tab strip is one stop,
 * and the arrow keys move within it.
 * @param {object} options - The tab's identity and state.
 * @param {string} options.id - The tab's own element id, which its panel points back at.
 * @param {string} options.panelId - Element id of the panel the tab controls.
 * @param {boolean} options.selected - Whether this is the active tab.
 * @returns {string} The attribute string, ready to interpolate into a `<button>`.
 */
export function tabAttributes({ id, panelId, selected }) {
    return `role="tab" id="${id}" aria-controls="${panelId}" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}"`;
}

/**
 * The tab strip's keyboard contract, called from the owner's own `keydown` listener so the
 * listener's lifetime stays with the owner.
 *
 * ←/→ step, Home/End jump, and activation follows focus — both strips switch by replacing
 * one panel's contents, which is cheap enough that the APG's automatic-activation form is
 * the right one.
 * @param {KeyboardEvent} event - The keydown event.
 * @param {(tab: HTMLElement) => void} activate - Selects the tab the focus moved to.
 */
export function handleTabKeydown(event, activate) {
    if (!NAVIGATION_KEYS.has(event.key)) return;

    const target = /** @type {HTMLElement} */ (event.target);
    const current = target.closest?.('[role="tab"]');
    const list = current?.closest('[role="tablist"]');
    if (!current || !list) return;

    const tabs = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[role="tab"]')]);
    const index = tabs.indexOf(/** @type {HTMLElement} */ (current));
    if (index === -1) return;

    const next =
        event.key === 'Home'
            ? tabs[0]
            : event.key === 'End'
              ? tabs[tabs.length - 1]
              : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];

    // Both callers re-render their strip from scratch, so the element focus should land
    // on may not be this one any more — its id survives the re-render, the node does not.
    const nextId = next.id;
    event.preventDefault();
    activate(next);
    document.getElementById(nextId)?.focus();
}
