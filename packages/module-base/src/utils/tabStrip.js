/**
 * The keyboard half of the shared `.tab-strip` pattern; tabStrip.css beside it is the
 * visual half.
 *
 * The owner renders its own tabs: `role="tab"`, an `id` its panel points back at,
 * `aria-controls`, and a roving `tabindex` (only the selected tab is in the tab order,
 * the arrow keys move within the strip).
 */

import './tabStrip.css';

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * The tab strip's keyboard contract, called from the owner's own `keydown` listener so the
 * listener's lifetime stays with the owner.
 *
 * ←/→ step, Home/End jump, and activation follows focus (the APG's automatic-activation
 * form): for strips whose switch is cheap.
 * @param {KeyboardEvent} event
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

    // A caller may re-render its strip on activation: the tab's id survives that, its
    // node may not.
    const nextId = next.id;
    event.preventDefault();
    activate(next);
    document.getElementById(nextId)?.focus();
}
