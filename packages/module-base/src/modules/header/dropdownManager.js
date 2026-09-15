/**
 * DropdownManager — Centralized header-action dropdown coordinator
 *
 * Manages all `.header-action-dropdown` menus in the application:
 *   - Closes all other open dropdowns when one is opened
 *   - Closes all open dropdowns on outside clicks
 *   - Closes all open dropdowns on Escape key
 *   - Syncs `.active`/`.is-active` classes on trigger buttons with their dropdown's open state
 *
 * The host starts it once with `initDropdownManager()`. It is not self-installing:
 * importing a file must not attach listeners to someone else's document, and a
 * bundler told the package is side-effect-free would be entitled to drop an import
 * kept only for that.
 * Works with any dropdown that follows the pattern:
 *   wrapper > [aria-haspopup] button + ul.header-action-dropdown
 */

import { eventPathHasClass } from '../../utils/domBuilder.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Returns the `.header-action-dropdown` directly associated with a trigger
 * button (i.e. a sibling within the same wrapper element).
 * @param {Element} trigger - The button whose menu is wanted.
 * @returns {HTMLElement|null} The sibling dropdown in the same wrapper, or null when the trigger has none.
 */
function getDropdownForTrigger(trigger) {
    return (
        /** @type {HTMLElement|null} */ (
            trigger.parentElement?.querySelector('.header-action-dropdown') ?? null
        )
    );
}

/**
 * Closes a single dropdown and updates its trigger button's state.
 * @param {Element} dropdown - The menu to close; its trigger is restyled to match.
 */
export function closeDropdown(dropdown) {
    if (!dropdown.classList.contains('show')) return;
    dropdown.classList.remove('show');
    const trigger = dropdown.parentElement?.querySelector('[aria-haspopup]');
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('is-active');
    }
}

/**
 * Closes all open `.header-action-dropdown` elements, optionally skipping one.
 * @param {Element|null} [except] - A menu to leave open, when one is being opened in the same gesture.
 */
function closeAllDropdowns(except = null) {
    document.querySelectorAll('.header-action-dropdown.show').forEach((dd) => {
        if (dd !== except) closeDropdown(dd);
    });
}

/**
 * Toggles a trigger/dropdown pair and keeps header-action state in sync.
 * Opening a dropdown closes every other open header-action dropdown first.
 * @param {HTMLElement} trigger - The button that was activated.
 * @param {HTMLElement|null} [dropdown=getDropdownForTrigger(trigger)] - The menu to toggle; resolved from the trigger when omitted.
 * @param {object} [options] - A hook to run before the menu opens.
 * @param {Function} [options.onBeforeOpen] - Called right before the dropdown opens
 * @returns {boolean} True when the dropdown ends open, false when it ends closed
 */
export function toggleDropdown(trigger, dropdown = getDropdownForTrigger(trigger), options = {}) {
    if (!trigger || !dropdown) return false;

    if (dropdown.classList.contains('show')) {
        closeDropdown(dropdown);
        return false;
    }

    options.onBeforeOpen?.(dropdown, trigger);
    closeAllDropdowns(dropdown);
    dropdown.classList.add('show');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('is-active');
    return true;
}

/**
 * Click handler — runs after all button onclick handlers (bubbling phase).
 *
 * By the time this fires, the clicked trigger's own onclick has already toggled
 * its dropdown. We just need to close every other open dropdown.
 *
 * Three cases:
 *  1. Click inside an open dropdown (e.g. column visibility checkbox) → ignore
 *  2. Click on a trigger button → close all except this trigger's dropdown
 *  3. Click anywhere else → close all
 * @param {MouseEvent} e - The bubbling click.
 */
function handleDocumentClick(e) {
    // Case 1: click inside a dropdown menu — leave everything alone
    if (eventPathHasClass(e, 'header-action-dropdown')) return;

    // Case 2: click on a trigger button — close siblings, keep this one
    const trigger = /** @type {Element} */ (e.target).closest('[aria-haspopup]');
    if (trigger) {
        const ownDropdown = getDropdownForTrigger(trigger);
        closeAllDropdowns(ownDropdown);

        // Sync active trigger classes to match the dropdown's current .show state
        if (ownDropdown) {
            const isOpen = ownDropdown.classList.contains('show');
            trigger.classList.toggle('is-active', isOpen);
        }
        return;
    }

    // Case 3: outside click — close everything
    closeAllDropdowns();
}

/**
 * Keydown handler — Escape closes all open dropdowns and returns focus to
 * the trigger button of the first one found.
 * @param {KeyboardEvent} e - The bubbling keydown.
 */
function handleDocumentKeydown(e) {
    if (e.key !== 'Escape') return;
    const openDropdowns = document.querySelectorAll('.header-action-dropdown.show');
    if (!openDropdowns.length) return;

    // Return focus to the first open dropdown's trigger before closing
    const firstTrigger = openDropdowns[0].parentElement?.querySelector('[aria-haspopup]');
    openDropdowns.forEach((dd) => closeDropdown(dd));
    /** @type {HTMLElement|null} */ (firstTrigger)?.focus();
}

/** @type {boolean} Whether the document listeners are installed. */
let listening = false;

/**
 * Start coordinating every `.header-action-dropdown` on the page: one open at a
 * time, closed by an outside click or Escape. Call once during bootstrap; a second
 * call is a no-op.
 */
export function initDropdownManager() {
    if (listening) return;
    listening = true;
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
}
