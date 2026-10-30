/**
 * Escape for the non-modal surfaces, which
 * are `popover="manual"` and so get no Escape from the browser. Escape closes the
 * innermost open thing only, the rule a modal `<dialog>` follows natively: a handler
 * that dismissed something calls `preventDefault()` (in the capture phase, to run
 * ahead of the surface); an open
 * `popover="auto"` (a dropdown) is closed by the browser on the same key press, after
 * every handler, and an open modal closes on it too, so neither may also close the
 * surface beneath it.
 */

import { topModalDialog } from './modalDialog.js';

/**
 * Whether a `popover="auto"` (a dropdown) is open: the browser closes it on the next
 * Escape.
 * @returns {boolean}
 */
export function isAutoPopoverOpen() {
    // By state, not by attribute: a bare `popover` is `auto` too.
    return [...document.querySelectorAll(':popover-open')].some(
        (element) => element instanceof HTMLElement && element.popover === 'auto',
    );
}

/**
 * @param {KeyboardEvent} event - A keydown.
 * @returns {boolean} Whether it is an Escape no other layer has claimed.
 */
export function isUnclaimedEscape(event) {
    return (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !isAutoPopoverOpen() &&
        topModalDialog() === null
    );
}
