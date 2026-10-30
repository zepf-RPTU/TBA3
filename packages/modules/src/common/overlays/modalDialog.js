/**
 * A native `<dialog>` opened with `showModal()`, for an overlay that covers the page. The
 * browser supplies what a modal needs: the top layer, `::backdrop`, the page behind
 * made inert, focus moved in and handed back to the trigger on close, and Escape.
 * This adds the glossary-named close button and closes on a click on the backdrop.
 *
 * Escape closes the innermost open thing only: a handler that dismissed something
 * (a menu, an edit field) calls `preventDefault()` on the keydown, which the
 * browser reads as "no close request"; a popover opened above the dialog closes
 * first through the browser's own close-watcher stack.
 */

import { createElement, createIcon } from '@tba3/module-base';

/** @type {Array<HTMLDialogElement>} The open dialogs in the order they opened. */
const openOrder = [];

/**
 * The modal on top: a modal opened from another makes that one inert, and document
 * order does not say which opened last.
 * @returns {HTMLDialogElement|null} The last-opened dialog still open, null when none is.
 */
export function topModalDialog() {
    return openOrder.filter((dialog) => dialog.open).at(-1) ?? null;
}

export class ModalDialog {
    /** @type {HTMLDialogElement} */
    #dialog;
    /** @type {HTMLButtonElement} */
    #closeButton;
    /** @type {() => void} */
    #onClose;
    /** Whether `onClose` is still owed for the current open. */
    #shown = false;

    /**
     * @param {object} options
     * @param {string} [options.className] - The owner's class on the `<dialog>`, beside `.modal-dialog`.
     * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} options.glossary - Names the close button.
     * @param {() => void} [options.onClose] - Runs once per open, however the dialog closed (close button, backdrop, Escape, `close()`).
     */
    constructor({ className, glossary, onClose = () => {} }) {
        this.#onClose = onClose;
        this.#dialog = /** @type {HTMLDialogElement} */ (
            createElement('dialog', { className: ['modal-dialog', className] })
        );
        this.#closeButton = /** @type {HTMLButtonElement} */ (
            createElement('button', {
                className: 'btn btn--icon btn--size-toolbar-xs modal-close',
                attributes: {
                    type: 'button',
                    'aria-label': glossary.getRequiredEntryText(
                        'general.buttons.element_texts.close.label',
                    ),
                },
            })
        );
        this.#closeButton.append(createIcon('close'));

        // The dialog is the full-viewport layer around its panel, so a click whose target
        // is the dialog itself landed on the backdrop. But a press that began inside the
        // panel and was released on the backdrop (a text selection, a chart marquee)
        // clicks the dialog too, as the two targets' common ancestor: only a press that
        // also began on the backdrop closes. Clicks are not stopped, so document-level
        // delegation keeps working inside the dialog.
        let pressedBackdrop = false;
        this.#dialog.addEventListener('pointerdown', (e) => {
            pressedBackdrop = e.target === this.#dialog;
        });
        this.#dialog.addEventListener('click', (e) => {
            const target = /** @type {Node} */ (e.target);
            const onBackdrop = target === this.#dialog && pressedBackdrop;
            pressedBackdrop = false;
            if (onBackdrop || this.#closeButton.contains(target)) this.close();
        });
        // The event is queued: a dialog reopened before it arrives is not closed again.
        this.#dialog.addEventListener('close', () => {
            if (!this.#dialog.open) this.#closed();
        });
    }

    /** @returns {HTMLDialogElement} The dialog; the owner fills it. */
    get element() {
        return this.#dialog;
    }

    /** @returns {HTMLButtonElement} The close button, not yet placed; the owner places it. */
    get closeButton() {
        return this.#closeButton;
    }

    /** @returns {boolean} */
    get isOpen() {
        return this.#dialog.open;
    }

    /**
     * Open the dialog as a modal; a no-op while it is open.
     * @param {string} label - The dialog's name for this open; owners read it from the glossary at open, so it follows the entry text.
     */
    show(label) {
        if (!this.#dialog.isConnected) document.body.append(this.#dialog);
        this.#dialog.setAttribute('aria-label', label);
        if (!this.#dialog.open) {
            // Closed by the browser, its `close` event still queued: settle that open's
            // `onClose` now, as the event will find the dialog open and skip it.
            this.#closed();
            this.#dialog.showModal();
            openOrder.push(this.#dialog);
        }
        this.#shown = true;
    }

    /** Close the dialog; `onClose` runs at once, not when the queued `close` event arrives. */
    close() {
        if (this.#dialog.open) this.#dialog.close();
        this.#closed();
    }

    /** Close and remove the dialog. */
    destroy() {
        this.close();
        this.#dialog.remove();
    }

    #closed() {
        const at = openOrder.indexOf(this.#dialog);
        if (at !== -1) openOrder.splice(at, 1);
        if (!this.#shown) return;
        this.#shown = false;
        this.#onClose();
    }
}
