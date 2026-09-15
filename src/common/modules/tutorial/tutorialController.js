/**
 * TutorialController — app-agnostic guided-walkthrough engine; its button labels
 * are the shared `general.buttons.element_texts.tour-*` glossary entries.
 *
 * Drives an ordered array of steps: dims the page with a box-shadow spotlight
 * ring around one anchor element at a time and shows a callout card with
 * Zurück / Überspringen / Weiter (Fertig on the last step) plus progress dots.
 * The ring and root keep `pointer-events: none`, so the spotlighted element
 * stays hoverable — a live glossary tooltip genuinely appears over the dim.
 *
 * Composes SingletonOverlay for the body-level mount + Escape-close, mirroring
 * NotesController. It is a plain page-lifetime singleton the app owns, not a
 * BaseModule; scroll/resize listeners exist only while a tour is open.
 *
 * Steps come from src/common/modules/tutorial/tourStepBuilder.js; BaseAppModule
 * owns the instance and drives it from the header info button.
 */

import { SingletonOverlay } from '../overlays/singletonOverlay.js';
import './tutorialController.css';
import { glossaryAnnotator } from '@tba3/modules/glossary';

/**
 * One card in a walkthrough. The anchor resolves lazily so a view re-render
 * (Tabulator header rebuild, chart redraw) doesn't strand an element ref.
 * A step with no `getAnchor` is deliberately unanchored and shows centered;
 * a `getAnchor` that returns null means the anchor went missing, and warns.
 * @typedef {object} TourStep
 * @property {() => (HTMLElement|null)} [getAnchor] - Lazy anchor resolver
 * @property {string} title - Card heading
 * @property {string} html - Card body (glossary-annotated)
 */

const RING_PADDING = 8; // px breathing room around the spotlighted element
const CARD_GAP = 12; // px gap between the ring and the callout card
const VIEWPORT_MARGIN = 12; // px minimum distance from the viewport edges

export class TutorialController {
    /** @type {SingletonOverlay} */
    #overlay;
    /** @type {HTMLElement|null} */
    #rootEl = null;
    /** @type {HTMLElement|null} */
    #ringEl = null;
    /** @type {HTMLElement|null} */
    #cardEl = null;
    /** @type {HTMLElement|null} */
    #titleEl = null;
    /** @type {HTMLElement|null} */
    #bodyEl = null;
    /** @type {HTMLElement|null} */
    #progressEl = null;
    /** @type {HTMLButtonElement|null} */
    #backBtn = null;
    /** @type {HTMLButtonElement|null} */
    #nextBtn = null;

    /** @type {TourStep[]} */
    #steps = [];
    #index = 0;
    #active = false;
    /** @type {(() => void)|null} */
    #onClose = null;

    /** @type {() => void} */
    #onReposition;
    #repositionScheduled = false;
    /** @type {HTMLElement|null} Element that had focus when the tour opened. */
    #trigger = null;

    constructor() {
        this.#overlay = new SingletonOverlay(
            'tutorial-tour-overlay',
            (root) => this.#buildShell(root),
            {
                onHide: () => this.#handleHide(),
            },
        );
        this.#onReposition = () => this.#scheduleReposition();
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Start the walkthrough with an ordered list of steps.
     * @param {TourStep[]} steps - The cards to show, in visit order.
     * @param {{onClose?: () => void}} [options] - Notified when the walkthrough ends, however it ended.
     */
    start(steps, { onClose } = {}) {
        if (!Array.isArray(steps) || steps.length === 0) return;

        this.#steps = steps;
        this.#index = 0;
        this.#onClose = onClose ?? null;
        this.#active = true;

        this.#trigger =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.#overlay.show();
        window.addEventListener('scroll', this.#onReposition, true);
        window.addEventListener('resize', this.#onReposition);

        this.#renderStep();
        // A keyboard user opened the tour from a header button; without this the
        // card is on screen but focus is still on that button behind the dim.
        // #handleHide() hands focus back to it, so closing does not strand the
        // keyboard user on <body>.
        this.#nextBtn?.focus({ preventScroll: true });
        // Enable ring/card glide only after the first step is placed, so the
        // opening step snaps into position (masked by the overlay fade-in)
        // instead of sliding in from the corner.
        requestAnimationFrame(() => this.#rootEl?.classList.add('is-ready'));
    }

    /** Close the walkthrough (fires the onClose callback). No-op if not open. */
    close() {
        if (!this.#active) return;
        this.#overlay.hide(); // routes through #handleHide()
    }

    // ========================================================================
    // SHELL
    // ========================================================================

    #buildShell(root) {
        this.#rootEl = root;

        const ring = document.createElement('div');
        ring.className = 'tutorial-tour-ring';

        const card = document.createElement('div');
        card.className = 'tutorial-tour-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-live', 'polite');

        const title = document.createElement('h3');
        title.className = 'tutorial-tour-card-title';

        const body = document.createElement('div');
        body.className = 'tutorial-tour-card-body';

        const progress = document.createElement('div');
        progress.className = 'tutorial-tour-progress';
        progress.setAttribute('aria-hidden', 'true');

        const actions = document.createElement('div');
        actions.className = 'tutorial-tour-actions';

        const back = this.#createActionButton(
            'tutorial-tour-back',
            glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.tour-back.label'),
            ['btn', 'btn--text'],
        );
        back.addEventListener('click', () => this.#prev());

        const skip = this.#createActionButton(
            'tutorial-tour-skip',
            glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.tour-skip.label'),
            ['btn', 'btn--text'],
        );
        skip.addEventListener('click', () => this.close());

        const next = this.#createActionButton(
            'tutorial-tour-next',
            glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.tour-next.label'),
            ['btn', 'btn--text', 'btn--primary'],
        );
        next.addEventListener('click', () => this.#next());

        actions.append(back, skip, next);
        card.append(title, body, progress, actions);
        root.append(ring, card);

        this.#ringEl = ring;
        this.#cardEl = card;
        this.#titleEl = title;
        this.#bodyEl = body;
        this.#progressEl = progress;
        this.#backBtn = back;
        this.#nextBtn = next;
    }

    #createActionButton(className, label, sharedClasses) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = [...sharedClasses, className].join(' ');
        btn.textContent = label;
        return btn;
    }

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

    #renderStep() {
        const step = this.#steps[this.#index];
        if (!step || !this.#cardEl) return;

        if (this.#titleEl) this.#titleEl.textContent = step.title ?? '';
        if (this.#bodyEl) this.#bodyEl.innerHTML = step.html ?? '';

        this.#renderProgress();

        const isFirst = this.#index === 0;
        const isLast = this.#index === this.#steps.length - 1;
        if (this.#backBtn) this.#backBtn.disabled = isFirst;
        if (this.#nextBtn)
            this.#nextBtn.textContent = isLast
                ? glossaryAnnotator.getRequiredEntryText(
                      'general.buttons.element_texts.tour-finish.label',
                  )
                : glossaryAnnotator.getRequiredEntryText(
                      'general.buttons.element_texts.tour-next.label',
                  );

        const anchor = step.getAnchor?.() ?? null;

        // Derived module steps cannot lose their anchor (no module, no step), so
        // a resolver that came back empty means a shell-level anchor — an export
        // or notes button — went missing. Say so once, on entering the step:
        // #position() re-resolves on every scroll and resize frame, so warning
        // there would flood the console for as long as the step is shown. A step
        // that declares no resolver at all is centered on purpose and stays quiet.
        if (!anchor && step.getAnchor) {
            console.warn(
                `TutorialController: step ${this.#index + 1} lost its anchor ("${step.title ?? ''}")`,
            );
        }

        // Place immediately against the current anchor rect so the card never
        // paints at 0,0, then bring the anchor into view; the scroll listener
        // keeps ring + card aligned through the smooth scroll.
        this.#position();
        anchor?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        requestAnimationFrame(() => this.#position());
    }

    #renderProgress() {
        if (!this.#progressEl) return;
        this.#progressEl.replaceChildren();
        for (let i = 0; i < this.#steps.length; i += 1) {
            const dot = document.createElement('span');
            dot.className = 'tutorial-tour-progress-dot';
            if (i === this.#index) dot.classList.add('is-active');
            this.#progressEl.appendChild(dot);
        }
    }

    // ========================================================================
    // POSITIONING
    // ========================================================================

    #scheduleReposition() {
        if (this.#repositionScheduled) return;
        this.#repositionScheduled = true;
        requestAnimationFrame(() => {
            this.#repositionScheduled = false;
            if (this.#active) this.#position();
        });
    }

    #position() {
        if (!this.#active || !this.#ringEl || !this.#cardEl) return;

        const step = this.#steps[this.#index];
        const anchor = step?.getAnchor?.() ?? null;

        if (!anchor) {
            // Missing anchors are reported once per step in #renderStep(); this
            // path runs on every scroll/resize frame and must stay silent.
            this.#ringEl.style.display = 'none';
            this.#centerCard();
            return;
        }

        const rect = anchor.getBoundingClientRect();
        this.#ringEl.style.display = '';
        this.#ringEl.style.top = `${rect.top - RING_PADDING}px`;
        this.#ringEl.style.left = `${rect.left - RING_PADDING}px`;
        this.#ringEl.style.width = `${rect.width + RING_PADDING * 2}px`;
        this.#ringEl.style.height = `${rect.height + RING_PADDING * 2}px`;

        this.#positionCard(rect);
    }

    #positionCard(rect) {
        const card = this.#cardEl;
        if (!card) return;

        const cardRect = card.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Prefer below the anchor; flip above when there isn't room and above
        // has more space. Then clamp within the viewport either way.
        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;
        const fitsBelow = spaceBelow >= cardRect.height + CARD_GAP + VIEWPORT_MARGIN;

        let top =
            fitsBelow || spaceBelow >= spaceAbove
                ? rect.bottom + CARD_GAP
                : rect.top - CARD_GAP - cardRect.height;
        top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - cardRect.height - VIEWPORT_MARGIN));

        let left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(rect.left, vw - cardRect.width - VIEWPORT_MARGIN),
        );

        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    }

    #centerCard() {
        const card = this.#cardEl;
        if (!card) return;
        const cardRect = card.getBoundingClientRect();
        card.style.top = `${Math.max(VIEWPORT_MARGIN, (window.innerHeight - cardRect.height) / 2)}px`;
        card.style.left = `${Math.max(VIEWPORT_MARGIN, (window.innerWidth - cardRect.width) / 2)}px`;
    }

    #handleHide() {
        if (!this.#active) return;
        this.#active = false;

        window.removeEventListener('scroll', this.#onReposition, true);
        window.removeEventListener('resize', this.#onReposition);
        this.#rootEl?.classList.remove('is-ready');

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
