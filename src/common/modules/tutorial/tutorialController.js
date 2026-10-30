/**
 * TutorialController — app-agnostic guided-walkthrough engine; its button labels
 * are the shared `general.buttons.element_texts.tour-*` glossary entries.
 *
 * Drives an ordered array of steps: dims the page with a box-shadow spotlight
 * ring around one anchor element at a time and shows a callout card with
 * Zurück / Überspringen / Weiter (Fertig on the last step) plus progress dots.
 * The ring and root keep `pointer-events: none`, so the spotlighted element
 * stays hoverable and a live glossary tooltip appears over the dim.
 *
 * The overlay is a `popover="manual"` on the body: the top layer, so the dim
 * covers every page layer, but no modal — the page stays interactive under it, and
 * popovers opened later (a glossary popup in the card) stack above it. A manual
 * popover gets no Escape from the browser, so the tour listens for one nothing
 * else claimed. It is a plain page-lifetime singleton the app owns, not a
 * BaseModule.
 */

import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { createElement, FOCUSABLE, requireEl, trusted } from '@tba3/module-base';
import { html, render } from 'lit';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { isUnclaimedEscape } from '@tba3/modules/overlays';
import './tutorialController.css';

/**
 * One card in a walkthrough. The anchor resolves lazily so a view re-render
 * (Tabulator header rebuild, chart redraw) doesn't strand an element ref.
 * A step with no `getAnchor` is deliberately unanchored and shows centered;
 * a `getAnchor` that returns null means the anchor went missing, and warns.
 * @typedef {object} TourStep
 * @property {() => (HTMLElement|null)} [getAnchor]
 * @property {string} title - Card heading
 * @property {string} html - Card body (glossary-annotated)
 */

const RING_PADDING_PX = 8; // breathing room around the spotlighted element
const CARD_GAP_PX = 12; // between the anchor and the callout card
const VIEWPORT_MARGIN_PX = 12; // minimum distance from the viewport edges
const TITLE_ID = 'tutorial-tour-card-title';

/**
 * The overlay's positioned parts; the card's content is a lit-html template rendered
 * into the card per step.
 * @typedef {object} TourShell
 * @property {HTMLElement} root - The overlay.
 * @property {HTMLElement} ring - The spotlight.
 * @property {HTMLElement} card
 */

/** @returns {ScrollBehavior} Smooth, unless the reader asked for reduced motion. */
const scrollBehavior = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

export class TutorialController {
    /** @type {import('@tba3/modules/context').GlossaryAnnotator} The app's glossary, which words the tour's buttons. */
    #glossary;
    /** @type {TourShell|null} Built on the first start(). */
    #shell = null;

    /** @type {TourStep[]} */
    #steps = [];
    #index = 0;
    #active = false;
    /** @type {(() => void)|null} */
    #onClose = null;

    /** @type {HTMLElement|null} The element the card is currently bound to. */
    #boundTo = null;
    /** @type {(() => void)|null} Stops the current `autoUpdate`. */
    #stopTracking = null;
    /** The frame that turns the glide on after the first step; cancelled by a close before it. */
    #readyFrame = 0;
    /** @type {HTMLElement|null} Element that had focus when the tour opened. */
    #trigger = null;
    /** @type {AbortController|null} The window Escape listener of the running tour. */
    #escape = null;

    /**
     * @param {object} options
     * @param {import('@tba3/modules/context').GlossaryAnnotator} options.glossary
     */
    constructor({ glossary }) {
        this.#glossary = glossary;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Start the walkthrough with an ordered list of steps.
     * @param {TourStep[]} steps - In visit order.
     * @param {{onClose: () => void}} options - Notified when the walkthrough ends, however it ended.
     */
    start(steps, { onClose }) {
        if (steps.length === 0) return;
        // A running tour ends before the next begins.
        this.close();

        this.#steps = steps;
        this.#index = 0;
        this.#onClose = onClose;
        this.#active = true;

        this.#trigger =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.#shell ??= this.#buildShell();
        const shell = this.#shell;
        shell.root.showPopover();
        this.#escape = new AbortController();
        // On window, so it runs after every element and document handler.
        window.addEventListener(
            'keydown',
            (e) => {
                if (!isUnclaimedEscape(e)) return;
                e.preventDefault();
                this.close();
            },
            { signal: this.#escape.signal },
        );
        this.#renderStep();
        // Without this, focus stays on the header button behind the dim;
        // #handleHide() hands it back there.
        requireEl(shell.card, '.tutorial-tour-next').focus({ preventScroll: true });
        // Enable ring/card glide only after the first step is placed, so the
        // opening step snaps into position (masked by the overlay fade-in)
        // instead of sliding in from the corner.
        this.#readyFrame = requestAnimationFrame(() => {
            this.#readyFrame = 0;
            shell.root.classList.add('is-ready');
        });
    }

    /** @returns {boolean} Whether a walkthrough is running. */
    get isOpen() {
        return this.#active;
    }

    /** Close the walkthrough and fire onClose. No-op if not open. */
    close() {
        if (!this.#active) return;
        this.#shell?.root.hidePopover();
        this.#handleHide();
    }

    // ========================================================================
    // SHELL
    // ========================================================================

    /** @returns {TourShell} Appended to the body. */
    #buildShell() {
        const root = createElement('div', {
            className: 'tutorial-tour-overlay',
            attributes: { popover: 'manual' },
        });
        const shell = {
            root,
            ring: createElement('div', { className: 'tutorial-tour-ring' }),
            card: createElement('div', {
                className: 'tutorial-tour-card layout-stack',
                attributes: { role: 'dialog', 'aria-labelledby': TITLE_ID, 'aria-live': 'polite' },
            }),
        };
        root.append(shell.ring, shell.card);
        // The card is no modal, but Tab past its last button would land on <body> behind
        // the dim: Tab and Shift+Tab wrap within it.
        shell.card.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            const stops = [...shell.card.querySelectorAll(FOCUSABLE)];
            const edge = event.shiftKey ? stops[0] : stops.at(-1);
            if (!edge || document.activeElement !== edge) return;
            event.preventDefault();
            /** @type {HTMLElement} */ (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
        });
        document.body.append(root);
        return shell;
    }

    /**
     * The card's content for the current step: heading, the progress for screen
     * readers, the glossary-annotated copy, the dots and the buttons. Button labels
     * go in as `textContent`, so the formatter's line breaks stay out of their text.
     * @param {TourStep} step
     * @returns {import('lit').TemplateResult}
     */
    #cardTemplate(step) {
        const isLast = this.#index === this.#steps.length - 1;
        const status = applyTemplateTokens(
            this.#glossary.getRequiredEntryText('general.messages.tour-progress'),
            { step: String(this.#index + 1), total: String(this.#steps.length) },
        );
        const dots = this.#steps.map(
            (_, i) =>
                html`<span
                    class="tutorial-tour-progress-dot ${i === this.#index ? 'is-active' : ''}"
                ></span>`,
        );
        return html`<h2 id=${TITLE_ID}>${step.title}</h2>
            <p class="visually-hidden">${status}</p>
            <div class="tutorial-tour-card-body">${trusted(step.html)}</div>
            <div class="tutorial-tour-progress" aria-hidden="true">${dots}</div>
            <div class="tutorial-tour-actions">
                <button
                    type="button"
                    class="btn btn--text tutorial-tour-back"
                    ?disabled=${this.#index === 0}
                    @click=${this.#onBack}
                    .textContent=${this.#buttonLabel('tour-back')}
                ></button
                ><button
                    type="button"
                    class="btn btn--text"
                    @click=${this.#onSkip}
                    .textContent=${this.#buttonLabel('tour-skip')}
                ></button
                ><button
                    type="button"
                    class="btn btn--text btn--primary tutorial-tour-next"
                    @click=${this.#onNext}
                    .textContent=${this.#buttonLabel(isLast ? 'tour-finish' : 'tour-next')}
                ></button>
            </div>`;
    }

    #onBack = () => this.#prev();
    #onSkip = () => this.close();
    #onNext = () => this.#next();

    // ========================================================================
    // NAVIGATION
    // ========================================================================

    #next() {
        if (this.#index >= this.#steps.length - 1) {
            this.close();
            return;
        }
        this.#index += 1;
        this.#renderStep();
    }

    #prev() {
        if (this.#index === 0) return;
        this.#index -= 1;
        this.#renderStep();
    }

    /**
     * @param {string} key - Entry under `general.buttons.element_texts`.
     * @returns {string}
     */
    #buttonLabel(key) {
        return this.#glossary.getRequiredEntryText(`general.buttons.element_texts.${key}.label`);
    }

    #renderStep() {
        const shell = /** @type {TourShell} */ (this.#shell);
        const step = this.#steps[this.#index];
        render(this.#cardTemplate(step), shell.card);

        const anchor = step.getAnchor?.() ?? null;
        // A step without a resolver is centred on purpose; one whose resolver came back
        // empty lost its element. Say so once, on entering the step.
        if (!anchor && step.getAnchor) {
            console.warn(
                `TutorialController: step ${this.#index + 1} lost its anchor ("${step.title}")`,
            );
        }

        this.#track(anchor);
        anchor?.scrollIntoView({ behavior: scrollBehavior(), block: 'center', inline: 'nearest' });
    }

    // ========================================================================
    // POSITIONING
    // ========================================================================

    /**
     * Keep ring and card on an anchor — or the card centred, without one — until the
     * next step or the close. Floating UI's `autoUpdate` places at once and again on
     * every scroll (nested scrollers included), resize and anchor resize.
     * @param {HTMLElement|null} anchor
     */
    #track(anchor) {
        this.#stopTracking?.();
        this.#boundTo = anchor;
        const shell = /** @type {TourShell} */ (this.#shell);
        // Without an anchor the card follows the viewport.
        this.#stopTracking = autoUpdate(anchor ?? document.documentElement, shell.card, () =>
            this.#position(),
        );
    }

    #position() {
        if (!this.#active) return;
        const shell = /** @type {TourShell} */ (this.#shell);
        const step = this.#steps[this.#index];
        const anchor = step.getAnchor?.() ?? null;
        // A re-render replaced the anchor: follow the new element.
        if (anchor !== this.#boundTo) {
            this.#track(anchor);
            return;
        }

        if (!anchor) {
            shell.ring.style.display = 'none';
            this.#centerCard(shell.card);
            return;
        }

        const rect = anchor.getBoundingClientRect();
        shell.ring.style.display = '';
        shell.ring.style.translate = `${rect.left - RING_PADDING_PX}px ${rect.top - RING_PADDING_PX}px`;
        shell.ring.style.width = `${rect.width + RING_PADDING_PX * 2}px`;
        shell.ring.style.height = `${rect.height + RING_PADDING_PX * 2}px`;

        // Below the anchor, left-aligned with it; above when below does not fit; kept
        // inside the viewport either way.
        void computePosition(anchor, shell.card, {
            strategy: 'fixed',
            placement: 'bottom-start',
            middleware: [
                offset(CARD_GAP_PX),
                flip({ padding: VIEWPORT_MARGIN_PX }),
                shift({ padding: VIEWPORT_MARGIN_PX, crossAxis: true }),
            ],
        }).then(({ x, y }) => {
            if (this.#active) shell.card.style.translate = `${x}px ${y}px`;
        });
    }

    /** @param {HTMLElement} card - The callout card, centred in the viewport. */
    #centerCard(card) {
        const cardRect = card.getBoundingClientRect();
        const { clientWidth: vw, clientHeight: vh } = document.documentElement;
        const left = Math.max(VIEWPORT_MARGIN_PX, (vw - cardRect.width) / 2);
        const top = Math.max(VIEWPORT_MARGIN_PX, (vh - cardRect.height) / 2);
        card.style.translate = `${left}px ${top}px`;
    }

    #handleHide() {
        if (!this.#active) return;
        this.#active = false;

        this.#escape?.abort();
        this.#escape = null;
        this.#stopTracking?.();
        this.#stopTracking = null;
        this.#boundTo = null;
        cancelAnimationFrame(this.#readyFrame);
        this.#readyFrame = 0;
        this.#shell?.root.classList.remove('is-ready');

        const trigger = this.#trigger;
        this.#trigger = null;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });

        const onClose = this.#onClose;
        this.#onClose = null;
        this.#steps = [];
        this.#index = 0;

        onClose?.();
    }
}
