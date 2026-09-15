/**
 * SingletonOverlay — shared mount/visibility/Escape-close mechanics for a
 * page-lifetime overlay appended to document.body. Composed (not extended)
 * by the classes that need it (e.g. NotesController, ItemPreviewOverlay);
 * content, backdrop-click, and any body-scroll-lock stay owned by the
 * composing class since those vary per overlay.
 */

import { openModalDialog } from '@tba3/module-base';

export class SingletonOverlay {
    /** @type {HTMLElement|null} */
    #rootEl = null;
    #visible = false;
    #className;
    /** @type {(root: HTMLElement) => void} */
    #buildContent;
    /** @type {() => boolean} */
    #blockEscapeClose;
    /** @type {() => void} */
    #onShow;
    /** @type {() => void} */
    #onHide;
    /** @type {{ label: string } | null} */
    #modal;
    /** @type {(() => void) | null} */
    #closeModal = null;

    /**
     * @param {string} className - CSS class for the root element (visibility toggled via `.visible`)
     * @param {(root: HTMLElement) => void} buildContent - Populates the root's inner markup/wiring on first show()
     * @param {object} [options] - Escape handling and the show/hide notifications.
     * @param {() => boolean} [options.blockEscapeClose] - Return true to suppress an Escape-triggered close
     * @param {() => void} [options.onShow] - Fires on every show(), regardless of trigger
     * @param {() => void} [options.onHide] - Fires on every hide(), regardless of trigger (including Escape)
     * @param {{ label: string } | null} [options.modal] - Open as a modal dialog (see modalFocus.js): the root gets the dialog role and this name, the page behind it goes inert, focus moves in and back out
     */
    constructor(
        className,
        buildContent,
        { blockEscapeClose = () => false, onShow = () => {}, onHide = () => {}, modal = null } = {},
    ) {
        this.#className = className;
        this.#buildContent = buildContent;
        this.#blockEscapeClose = blockEscapeClose;
        this.#onShow = onShow;
        this.#onHide = onHide;
        this.#modal = modal;
    }

    show() {
        const root = this.#rootEl ?? this.#build();
        root.classList.add('visible');
        this.#visible = true;
        if (this.#modal) this.#closeModal ??= openModalDialog(root, this.#modal);
        this.#onShow();
        return root;
    }

    hide() {
        this.#rootEl?.classList.remove('visible');
        this.#visible = false;
        this.#closeModal?.();
        this.#closeModal = null;
        this.#onHide();
    }

    toggle() {
        if (this.#visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    getRoot() {
        return this.#rootEl;
    }

    #build() {
        const root = document.createElement('div');
        root.className = this.#className;
        document.body.appendChild(root);
        this.#rootEl = root;
        this.#buildContent(root);

        // Capture phase: must run before other document-level Escape handlers
        // (e.g. dropdownManager.js's self-initializing bubble-phase listener)
        // so blockEscapeClose() can still see state a bubble-phase handler would
        // have already torn down by the time it runs.
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape' && this.#visible && !this.#blockEscapeClose()) {
                    this.hide();
                }
            },
            true,
        );

        return root;
    }
}
