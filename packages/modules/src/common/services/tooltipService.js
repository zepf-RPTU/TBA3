/**
 * TooltipService — the singleton owning every interactive tooltip and popup lifecycle.
 *
 * Glossary term annotation belongs to `glossaryAnnotator`; the element-anchored popup
 * DOM primitive lives in `anchoredPopup.js`.
 *
 * Three modes:
 * 1. **Cursor-following** — rich HTML that follows the mouse (charts, dense visuals).
 *    Rendered as-is: no glossary annotation is injected into their HTML.
 * 2. **Delegated element-anchored** — driven by `data-tooltip-text` (plain) or
 *    `data-tooltip-html` (rich, glossary-annotated, interactive), through a single
 *    shared popup element set up once by `setupDelegatedTooltips()`.
 * 3. **Glossary popups** — stackable, anchored, triggered by hovering
 *    `[data-glossary-key]`; opt in with `initGlossaryPopups()`.
 *
 * Cleanup runs on `AbortSignal`: callers pass `signal` to `create()`, and ChartRenderer
 * owns one controller it aborts in `destroy()`. Mode 1 is a renderer concern only —
 * modules reach the reader through modes 2 and 3, which need no per-module wiring.
 *
 * Bootstrap order matters, once per app:
 *   glossaryAnnotator.init(glossary, 'en');
 *   tooltipService.initGlossaryPopups();
 *   tooltipService.setupDelegatedTooltips();
 */

import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import {
    createAnchoredPopupElement,
    showAnchoredPopup,
    hideAnchoredPopupImmediate,
    removePopupAfterTransition,
} from './anchoredPopup.js';
import * as d3 from 'd3';
import './tooltipService.css';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Gap between the cursor and a cursor-following tooltip. */
const CURSOR_OFFSET_X = 10;
const CURSOR_OFFSET_Y = -10;

/**
 * Shared close-delay for every hover surface (cursor tooltips, delegated
 * popups, glossary popups). Gives users time to cross the physical gap
 * between trigger and popup; CSS ::before bridges cover the gap at the
 * DOM level — this is the safety net.
 */
const HOVER_CLOSE_GRACE = 150;

/** Glossary popup open delay — distinct semantic from close grace. */
const GLOSSARY_HOVER_OPEN_DELAY = 500;

/** DOM removal delay — must match the CSS opacity transition for popups. */
const POPUP_REMOVE_TRANSITION_MS = 150;

const DELEGATED_TOOLTIP_ID = 'tooltip-delegated';
const DELEGATED_TOOLTIP_SELECTOR = '[data-tooltip-text], [data-tooltip-html]';

const GLOSSARY_CONFIG = {
    popupClass: 'glossary-popup',
    levelAttribute: 'data-glossary-level',
    termSelector: '[data-glossary-key]',
    baseZIndex: 10001,
};

/** Dismiss button, rendered only into tap-opened glossary popups. */
const GLOSSARY_CLOSE_CLASS = 'glossary-popup-close';

/**
 * Read at render time, not at import: the glossary tree only exists after the
 * app has called `glossaryAnnotator.init(...)`, which happens long after this
 * module is evaluated.
 * @returns {string} The dismiss button's accessible name.
 */
const glossaryCloseLabel = () =>
    glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.close.label');

// ============================================================================
// TOOLTIP SERVICE
// ============================================================================

class TooltipService {
    // --- Cursor-following tooltip state --------------------------------------

    /** @type {Map<string, number>} Pending hide timers per tooltip id */
    #hideTimers = new Map();

    /** @type {Set<string>} Ids of tooltips flagged interactive */
    #interactiveTooltips = new Set();

    // --- Delegated (anchored) tooltip state ----------------------------------

    #delegatedTooltipsInitialized = false;
    /** @type {HTMLDivElement|null} */
    #delegatedTooltipElement = null;
    /** @type {HTMLElement|null} */
    #activeDelegatedTooltipTrigger = null;
    /** @type {MutationObserver|null} */
    #delegatedTriggerObserver = null;

    // --- Glossary popup state ------------------------------------------------

    #glossaryPopupsInitialized = false;
    /** @type {Array<{element: HTMLDivElement, termElement: HTMLElement, key: string, level: number}>} */
    #glossaryPopupStack = [];
    /** @type {number|null} */
    #glossaryHoverTimeout = null;
    /** @type {number|null} */
    #glossaryHideTimeout = null;
    /** @type {Set<number>} Pending popup-removal timeouts for cleanup */
    #pendingRemovalTimeouts = new Set();

    // --- Shared body-level listener state ------------------------------------

    /** @type {AbortController|null} Body-level pointer/mouse/click listeners */
    #bodyAbortController = null;
    /** @type {AbortController|null} Scroll/resize/Escape listeners */
    #anchoredPopupAbortController = null;

    /**
     * Modality of the interaction in progress: the last `pointerType` seen.
     * A tap on iPadOS also fires simulated mouse events, so every hover path
     * below consults this instead of guessing from timing. An iPad trackpad
     * reports `mouse` and switches the paths back on its own.
     *
     * Three modalities, two paths: `mouse` gets the hover path only, `touch` the
     * tap path only, and `pen` both. A pen is the one pointer that can do either
     * — a Surface pen hovers and opens on dwell, an Apple Pencil cannot hover and
     * has only the tap. Gating it to one path would leave the other device with
     * no route at all, so it is denied neither.
     * @type {string}
     */
    #lastPointerType = 'mouse';

    /** @type {boolean} Whether the open glossary stack was opened by a tap. */
    #touchOpened = false;

    /** @type {TooltipService|null} */
    static #instance = null;

    static getInstance() {
        if (!TooltipService.#instance) {
            TooltipService.#instance = new TooltipService();
        }
        return TooltipService.#instance;
    }

    /** @private */
    constructor() {}

    // ========================================================================
    // CURSOR-FOLLOWING TOOLTIPS
    // ========================================================================

    /**
     * Create (or reuse) a cursor-following tooltip element.
     * Idempotent: returns the existing element when an ID match is found.
     * @param {object} options - Identity and behaviour of the tooltip being created.
     * @param {string} options.id - Unique ID suffix (a `tooltip-` prefix is added).
     * @param {AbortSignal} [options.signal] - Aborting this signal removes the tooltip.
     * @param {boolean} [options.interactive=false] - Delay hide so the cursor can travel into the tooltip.
     * @param {string} [options.variantClass] - Extra CSS class applied to the tooltip element.
     * @returns {d3.Selection} The tooltip element, newly created or the existing one.
     */
    create({ id, signal, interactive = false, variantClass }) {
        const fullId = `tooltip-${id}`;

        const existing = d3.select(`#${fullId}`);
        if (!existing.empty()) {
            if (variantClass) {
                existing.classed(variantClass, true);
            }
            if (interactive && !this.#interactiveTooltips.has(fullId)) {
                this.#interactiveTooltips.add(fullId);
                existing.classed('interactive', true);
                this.#wireInteractiveListeners(existing, fullId);
            }
            this.#bindCleanupSignal(fullId, signal);
            return existing;
        }

        const tooltip = d3.select('body').append('div').attr('id', fullId);

        const classes = ['tooltip'];
        if (variantClass) {
            classes.push(variantClass);
        }
        if (interactive) {
            classes.push('interactive');
            this.#interactiveTooltips.add(fullId);
            this.#wireInteractiveListeners(tooltip, fullId);
        }
        tooltip.attr('class', classes.join(' '));

        this.#bindCleanupSignal(fullId, signal);
        return tooltip;
    }

    /**
     * Show a tooltip at the cursor position.
     * @param {d3.Selection} tooltip - The element returned by `create`.
     * @param {MouseEvent} event - Pointer event whose page coordinates position the tooltip.
     * @param {string | object} content - HTML string, or structured `{ title, rows, ... }` for `buildHTML`.
     */
    show(tooltip, event, content) {
        const tooltipId = tooltip.attr('id');
        if (tooltipId) {
            this.#cancelHideTimer(tooltipId);
        }

        const htmlContent = typeof content === 'string' ? content : this.buildHTML(content);
        tooltip.html(htmlContent);

        const node = tooltip.node();
        if (!node) return;

        const { left, top } = this.#calculateCursorPosition(event, node);
        tooltip.style('left', `${left}px`).style('top', `${top}px`).classed('visible', true);
    }

    /**
     * Move the tooltip to follow the cursor.
     * @param {d3.Selection} tooltip - The tooltip being repositioned.
     * @param {MouseEvent} event - Pointer event supplying the new position.
     */
    move(tooltip, event) {
        const node = tooltip.node();
        if (!node) return;

        const { left, top } = this.#calculateCursorPosition(event, node);
        tooltip.style('left', `${left}px`).style('top', `${top}px`);
    }

    /**
     * Hide a tooltip. Interactive tooltips use a delayed hide (bridge grace).
     * @param {d3.Selection} tooltip - The tooltip to hide.
     */
    hide(tooltip) {
        const tooltipId = tooltip.attr('id');
        if (tooltipId && this.#interactiveTooltips.has(tooltipId)) {
            this.#scheduleHide(tooltip, tooltipId, HOVER_CLOSE_GRACE);
            return;
        }
        tooltip.classed('visible', false);
    }

    // --- Internal: signal/abort cleanup --------------------------------------

    #bindCleanupSignal(tooltipId, signal) {
        if (!signal) return;
        if (signal.aborted) {
            this.#cleanupTooltip(tooltipId);
            return;
        }
        signal.addEventListener(
            'abort',
            () => {
                this.#cleanupTooltip(tooltipId);
            },
            { once: true },
        );
    }

    /**
     * Remove element + associated state by id. Idempotent.
     * @param {string|null} tooltipId - Full element id, `tooltip-` prefix included.
     */
    #cleanupTooltip(tooltipId) {
        if (!tooltipId) return;
        this.#cancelHideTimer(tooltipId);
        this.#interactiveTooltips.delete(tooltipId);
        d3.select(`#${tooltipId}`).remove();
    }

    // --- Internal: hide-timer management -------------------------------------

    #cancelHideTimer(tooltipId) {
        if (!tooltipId) return;
        const timerId = this.#hideTimers.get(tooltipId);
        if (timerId !== undefined) {
            clearTimeout(timerId);
            this.#hideTimers.delete(tooltipId);
        }
    }

    #scheduleHide(tooltip, tooltipId, delay) {
        this.#cancelHideTimer(tooltipId);
        const timerId = setTimeout(() => {
            this.#hideTimers.delete(tooltipId);
            tooltip.classed('visible', false);
        }, delay);
        this.#hideTimers.set(tooltipId, timerId);
    }

    /**
     * Wire mouseenter/mouseleave on the tooltip node so users can hover into
     * an interactive tooltip without it disappearing.
     * @param {d3.Selection} tooltip - The tooltip to make hoverable.
     * @param {string} tooltipId - Full element id, used to key the pending-hide timer.
     */
    #wireInteractiveListeners(tooltip, tooltipId) {
        const node = tooltip.node();
        if (!node) return;

        node.addEventListener('mouseenter', () => {
            this.#cancelHideTimer(tooltipId);
        });

        node.addEventListener('mouseleave', () => {
            this.#scheduleHide(tooltip, tooltipId, HOVER_CLOSE_GRACE);
        });
    }

    // --- Internal: cursor positioning ----------------------------------------

    /**
     * Viewport-aware cursor-relative positioning.
     * @param {MouseEvent} event - Pointer event supplying the page coordinates.
     * @param {HTMLElement} tooltipNode - Measured to know whether the tooltip would overflow.
     * @returns {{left: number, top: number}} Page coordinates, flipped to the other side of the cursor where the tooltip would leave the viewport.
     */
    #calculateCursorPosition(event, tooltipNode) {
        const rect = tooltipNode.getBoundingClientRect();
        let left = event.pageX + CURSOR_OFFSET_X;
        let top = event.pageY + CURSOR_OFFSET_Y;

        if (left + rect.width > window.scrollX + window.innerWidth) {
            left = event.pageX - rect.width - CURSOR_OFFSET_X;
        }
        if (left < 0) {
            left = CURSOR_OFFSET_X;
        }
        if (top < 0) {
            top = event.pageY + Math.abs(CURSOR_OFFSET_Y);
        }
        if (top + rect.height > window.innerHeight + window.scrollY) {
            top = event.pageY - rect.height - CURSOR_OFFSET_Y;
        }
        return { left, top };
    }

    // ========================================================================
    // ANCHORED POPUP ENVIRONMENT (shared by delegated + glossary)
    // ========================================================================

    /**
     * Register shared environment listeners (scroll/resize/Escape) once.
     * Any anchored popup is dismissed on these events.
     */
    #ensureAnchoredPopupEnvironmentListeners() {
        if (this.#anchoredPopupAbortController) return;

        this.#anchoredPopupAbortController = new AbortController();
        const { signal } = this.#anchoredPopupAbortController;

        const throttle = (hide) => {
            let rafPending = false;
            return () => {
                if (rafPending) return;
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    hide();
                });
            };
        };

        // Scroll dismisses a hovered popup because the cursor has left its anchor.
        // A tapped-open one has no cursor to lose: it is positioned in page
        // coordinates (anchoredPopup.js adds scrollX/scrollY), so it travels with
        // its term and reading it means scrolling. Resize still dismisses both —
        // a rotation invalidates the anchor outright.
        window.addEventListener(
            'scroll',
            throttle(() => {
                if (this.#touchOpened) return;
                this.#hideAllAnchoredPopups();
            }),
            { signal, passive: true },
        );
        window.addEventListener(
            'resize',
            throttle(() => this.#hideAllAnchoredPopups()),
            {
                signal,
                passive: true,
            },
        );
        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key === 'Escape') {
                    this.#hideAllAnchoredPopups();
                }
            },
            { signal },
        );
    }

    #hideAllAnchoredPopups() {
        this.#hideDelegatedTooltipImmediate();
        // Clears #touchOpened with the stack it belongs to.
        this.hideGlossaryPopups();
    }

    // ========================================================================
    // UNIFIED BODY LISTENERS (B5)
    // ========================================================================

    /**
     * Register the body-level listeners once: the modality probe, the hover pair
     * and the tap handler.
     *
     * The mouseover/mouseout pair dispatches to both the delegated and glossary
     * handlers in sequence; handlers guard themselves with their own
     * initialization flags. On touch they return immediately — a tap on iPadOS
     * emits simulated mouse events, and letting them through is what makes
     * popups open late, close unpredictably and never nest.
     */
    #ensureBodyListeners() {
        if (this.#bodyAbortController) return;

        this.#bodyAbortController = new AbortController();
        const { signal } = this.#bodyAbortController;

        // Capture, and `pointerover` before `pointerdown`: `pointerover`
        // precedes `mouseover` in the same interaction, so the hover handlers
        // below already see the right modality on the very first event.
        const recordPointerType = (e) => {
            this.#lastPointerType = e.pointerType || 'mouse';
        };
        document.body.addEventListener('pointerover', recordPointerType, {
            signal,
            capture: true,
        });
        document.body.addEventListener('pointerdown', recordPointerType, {
            signal,
            capture: true,
        });

        document.body.addEventListener(
            'mouseover',
            (e) => {
                if (this.#lastPointerType === 'touch') return;
                this.#handleDelegatedMouseOver(e);
                this.#handleGlossaryMouseOver(e);
            },
            { signal },
        );

        document.body.addEventListener(
            'mouseout',
            (e) => {
                if (this.#lastPointerType === 'touch') return;
                this.#handleDelegatedMouseOut(e);
                this.#handleGlossaryMouseOut(e);
            },
            { signal },
        );

        // Capture, not bubble: chart click handlers call stopPropagation(), so a
        // bubble-phase listener would never fire for a tap on a mark and
        // tap-outside dismissal would silently stop working around charts.
        // Capture cannot preventDefault here, so the trigger's own click still runs.
        document.body.addEventListener('click', (e) => this.#handleTouchTap(e), {
            signal,
            capture: true,
        });
    }

    /**
     * The touch counterpart of the hover handlers: one tap opens, the next
     * closes, and a tap outside dismisses. Runs for a finger or a pen, no-op for a
     * mouse, except for the popup's own close button, which is handled whatever
     * the modality is.
     *
     * A tap never steals the trigger's own click — a glossary term inside a
     * button or link is skipped entirely, because opening a popup over a view
     * that is being replaced helps nobody.
     * @param {MouseEvent} event - The click a tap produced.
     */
    #handleTouchTap(event) {
        if (!(event.target instanceof Element)) return;
        const target = event.target;

        // Ahead of the modality gate, unlike everything below it: the button is
        // rendered only into a tap-opened popup, and the modality can flip to mouse
        // between the tap that rendered it and the press that dismisses it — a
        // tablet's trackpad waking up, or a keyboard activation after a mouse click
        // elsewhere. Gating it would leave the popup's only exit inert.
        const closeButton = this.#closestCompat(target, `.${GLOSSARY_CLOSE_CLASS}`);
        if (closeButton) {
            this.#hideGlossaryLevelsAbove(this.#getTermLevel(closeButton) - 1);
            return;
        }

        // `!== 'mouse'`, not `=== 'touch'`: a pen has to reach the tap path too.
        // The hover guards stay keyed to `touch`, so a pen that hovers keeps its
        // dwell-open and a pen that taps gets this one.
        if (this.#lastPointerType === 'mouse') return;

        // `detail` is 0 for a keyboard activation and for a programmatic click(),
        // 1 for a real tap. #lastPointerType is never reset — it holds whatever
        // the last pointer reported — so without this an Enter press after a tap
        // would take the whole tap path and pop the focused button's own label.
        if (event.detail === 0) return;

        // A pen tap arms the hover-open timer through the compat mouseover that
        // precedes this click; leaving it running would replace the popup opened
        // below with a close-button-less twin 500 ms later. No-op for a finger,
        // which fires no compat mouseover.
        this.#clearGlossaryHoverTimeout();

        const term = this.#closestCompat(target, GLOSSARY_CONFIG.termSelector);
        if (term && this.#glossaryPopupsInitialized && !this.#closestCompat(term, 'button, a')) {
            this.#toggleGlossaryPopupForTerm(term);
            return;
        }

        // Reading inside an open popup must not dismiss it.
        if (this.#closestCompat(target, `.${GLOSSARY_CONFIG.popupClass}`)) return;

        const trigger = target.closest(DELEGATED_TOOLTIP_SELECTOR);
        if (trigger && this.#delegatedTooltipsInitialized) {
            // Everything above has ruled out a term and the inside of a popup, so
            // this tap is outside the glossary stack and dismisses it like any
            // other — otherwise a popup would survive every icon button tapped.
            this.hideGlossaryPopups();
            this.#toggleDelegatedTooltip(/** @type {HTMLElement} */ (trigger));
            return;
        }

        if (this.#delegatedTooltipElement?.contains(target)) return;

        this.#hideAllAnchoredPopups();

        // Cursor tooltips are opened by the `mouseenter` that Chromium synthesises
        // *before* this click, so sweeping them here would kill the one this very
        // tap just opened. Dismissal cannot move to `pointerdown` either — that
        // also fires when a scroll gesture begins. So a chart keeps its tooltip
        // until the next mark or a tap outside the chart; only the sweep below is
        // given up, and no chart renderer needs to change.
        if (!this.#closestCompat(target, '.chart-container')) {
            d3.selectAll('.tooltip.visible').classed('visible', false);
        }
    }

    /**
     * Second tap on the same term closes it; otherwise open it at the next level
     * — synchronously, since a tap is already the deliberate act the 500 ms hover
     * delay exists to wait for. Nesting reuses the level machinery unchanged.
     * @param {Element} term - The tapped `[data-glossary-key]` element.
     */
    #toggleGlossaryPopupForTerm(term) {
        this.#clearGlossaryHoverTimeout();
        this.#clearGlossaryHideTimeout();

        for (const entry of this.#glossaryPopupStack) {
            if (entry.termElement === term) {
                this.#hideGlossaryLevelsAbove(entry.level - 1);
                return;
            }
        }

        const key = term.getAttribute('data-glossary-key');
        const resolvedKey = key ? glossaryAnnotator.resolveEntryKey(key) : null;
        if (!resolvedKey) return;

        this.#showGlossaryPopup(
            /** @type {HTMLElement} */ (term),
            resolvedKey,
            this.#getTermLevel(term) + 1,
            true,
        );
        // Read off the stack rather than set ahead of the show: #showGlossaryPopup
        // bails on an entry the key resolves to but the glossary does not carry,
        // and a flag left true with nothing open would disable scroll dismissal
        // for every popup opened after it.
        this.#touchOpened = this.#glossaryPopupStack.length > 0;
    }

    /**
     * Show or hide the label of an icon-only button. The button's own click runs
     * either way; only the label is toggled.
     * @param {HTMLElement} trigger - The `[data-tooltip-*]` element tapped.
     */
    #toggleDelegatedTooltip(trigger) {
        const isShowing =
            trigger === this.#activeDelegatedTooltipTrigger &&
            this.#delegatedTooltipElement?.classList.contains('visible');
        if (isShowing) {
            this.#hideDelegatedTooltipImmediate();
            return;
        }

        const payload = this.#getDelegatedTooltipPayload(trigger);
        if (!payload) return;
        this.#showDelegatedTooltip(trigger, payload);

        this.#dropLabelWithItsSurface(trigger);
    }

    /**
     * Take a tap-shown label away with the surface its trigger sits on.
     *
     * #toggleDelegatedTooltip runs in the capture phase, so the trigger's own click
     * has not run yet — and it may be the one that closes that surface (a modal's
     * "Abbrechen", a drawer's close). The disconnect watcher in
     * #showDelegatedTooltip does not cover it: those surfaces are hidden by a class,
     * not removed, so the trigger stays connected while the label hangs over
     * whatever the tap revealed, until the next tap anywhere.
     *
     * Checked once on the next frame and then after each transition that ends,
     * because a surface fades: one frame after the class comes off, its opacity is
     * still ~1 and `visibility` has not flipped yet. The listener leaves as soon as
     * either the label is gone or this trigger is no longer the active one.
     * @param {HTMLElement} trigger - The tapped `[data-tooltip-*]` element.
     */
    #dropLabelWithItsSurface(trigger) {
        const settled = () => {
            if (this.#activeDelegatedTooltipTrigger !== trigger) return true;
            if (trigger.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
                return false;
            }
            this.#hideDelegatedTooltipImmediate();
            return true;
        };

        requestAnimationFrame(() => {
            if (settled()) return;
            const onTransitionEnd = () => {
                if (settled()) {
                    document.body.removeEventListener('transitionend', onTransitionEnd, true);
                }
            };
            document.body.addEventListener('transitionend', onTransitionEnd, true);
        });
    }

    // ========================================================================
    // DELEGATED ELEMENT-ANCHORED TOOLTIPS
    // ========================================================================

    /**
     * Resolve delegated tooltip payload from a trigger element.
     *  - `data-tooltip-html` → rich HTML (annotated, interactive)
     *  - `data-tooltip-text` → plain text (non-interactive)
     * @param {Element|null} trigger - The element carrying the data attributes.
     * @returns {{content: string, mode: string}|null} The payload and which attribute supplied it, or null when the trigger carries neither.
     */
    #getDelegatedTooltipPayload(trigger) {
        if (!trigger) return null;
        const htmlContent = trigger.getAttribute('data-tooltip-html');
        if (htmlContent) return { content: htmlContent, mode: 'html' };
        const textContent = trigger.getAttribute('data-tooltip-text');
        if (textContent) return { content: textContent, mode: 'text' };
        return null;
    }

    #cancelDelegatedHide() {
        this.#cancelHideTimer(DELEGATED_TOOLTIP_ID);
    }

    #scheduleDelegatedHide(delay) {
        if (!this.#delegatedTooltipElement) return;
        this.#cancelDelegatedHide();
        const timerId = setTimeout(() => {
            this.#hideTimers.delete(DELEGATED_TOOLTIP_ID);
            this.#hideDelegatedTooltipImmediate();
        }, delay);
        this.#hideTimers.set(DELEGATED_TOOLTIP_ID, timerId);
    }

    /**
     * Is the event target inside the active delegated trigger or popup?
     * @param {EventTarget|null} target - Whatever the event reported.
     * @returns {boolean} True while the pointer is still on the tooltip surface.
     */
    #isWithinDelegatedSurface(target) {
        if (!(target instanceof Element)) return false;

        const trigger = this.#activeDelegatedTooltipTrigger;
        if (trigger && (target === trigger || trigger.contains(target))) return true;

        const popup = this.#delegatedTooltipElement;
        if (popup && (target === popup || popup.contains(target))) return true;

        return false;
    }

    /**
     * Is the target a glossary interaction spawned from the active delegated popup?
     * @param {EventTarget|null} target - Whatever the event reported.
     * @returns {boolean} True when dismissing would close a popup the user is still using.
     */
    #isDelegatedGlossaryContext(target) {
        if (!(target instanceof Element) || !this.#activeDelegatedTooltipTrigger) return false;

        const popupAncestor = this.#closestCompat(target, `.${GLOSSARY_CONFIG.popupClass}`);
        if (popupAncestor) {
            const entry = this.#glossaryPopupStack.find((e) => e.element === popupAncestor);
            return !!entry && this.#isWithinDelegatedSurface(entry.termElement);
        }

        const termElement = this.#closestCompat(target, GLOSSARY_CONFIG.termSelector);
        return !!termElement && this.#isWithinDelegatedSurface(termElement);
    }

    #shouldKeepDelegatedTooltipAlive(target) {
        return this.#isWithinDelegatedSurface(target) || this.#isDelegatedGlossaryContext(target);
    }

    /**
     * Native title tooltips conflict with delegated tooltip ownership.
     * @param {Element|null} trigger - Element whose `title` is moved out of the way.
     */
    #stripNativeTitleTooltip(trigger) {
        if (!(trigger instanceof Element) || !trigger.hasAttribute('title')) return;
        trigger.removeAttribute('title');
    }

    #showDelegatedTooltip(trigger, payload) {
        if (!this.#delegatedTooltipElement) return;

        this.#cancelDelegatedHide();
        this.#stripNativeTitleTooltip(trigger);
        this.#activeDelegatedTooltipTrigger = trigger;
        this.#delegatedTooltipElement.classList.toggle(
            'tooltip-chart',
            trigger.closest('.chart-container') !== null,
        );

        // Activate disconnect-watcher only while a tooltip is on screen — avoids
        // a subtree MutationObserver on document.body firing for unrelated DOM
        // churn (e.g. Tabulator redraws and D3 transitions during mode changes).
        if (this.#delegatedTriggerObserver) {
            this.#delegatedTriggerObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }

        showAnchoredPopup(this.#delegatedTooltipElement, trigger, payload, {
            annotate: payload.mode === 'html',
            interactive: payload.mode === 'html',
        });
    }

    #hideDelegatedTooltip() {
        if (!this.#delegatedTooltipElement) return;
        if (this.#delegatedTooltipElement.classList.contains('interactive')) {
            this.#scheduleDelegatedHide(HOVER_CLOSE_GRACE);
            return;
        }
        this.#hideDelegatedTooltipImmediate();
    }

    #hideDelegatedTooltipImmediate() {
        if (!this.#delegatedTooltipElement) return;
        this.#cancelDelegatedHide();
        this.#activeDelegatedTooltipTrigger = null;
        this.#delegatedTooltipElement.removeAttribute('data-placement');
        hideAnchoredPopupImmediate(this.#delegatedTooltipElement);
        // Pause the disconnect-watcher — re-armed by #showDelegatedTooltip on next show.
        if (this.#delegatedTriggerObserver) {
            this.#delegatedTriggerObserver.disconnect();
        }
    }

    #handleDelegatedMouseOver(e) {
        if (!this.#delegatedTooltipsInitialized) return;
        if (!(e.target instanceof Element)) return;

        const trigger = e.target.closest(DELEGATED_TOOLTIP_SELECTOR);
        if (!trigger) return;

        const payload = this.#getDelegatedTooltipPayload(trigger);
        if (!payload) return;

        if (trigger === this.#activeDelegatedTooltipTrigger) {
            this.#cancelDelegatedHide();
            if (this.#delegatedTooltipElement?.classList.contains('visible')) return;
        }

        this.#showDelegatedTooltip(trigger, payload);
    }

    #handleDelegatedMouseOut(e) {
        if (!this.#delegatedTooltipsInitialized) return;
        if (!(e.target instanceof Element)) return;

        const trigger = e.target.closest(DELEGATED_TOOLTIP_SELECTOR);
        if (!trigger || trigger !== this.#activeDelegatedTooltipTrigger) return;

        if (trigger.contains(e.relatedTarget)) return;
        if (this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)) return;

        this.#hideDelegatedTooltip();
    }

    /**
     * Set up delegated hover tooltips for elements marked with `data-tooltip-text`
     * or `data-tooltip-html`. Safe to call multiple times — initializes only once.
     */
    setupDelegatedTooltips() {
        if (this.#delegatedTooltipsInitialized) return;
        this.#delegatedTooltipsInitialized = true;

        this.#ensureAnchoredPopupEnvironmentListeners();
        this.#ensureBodyListeners();

        this.#delegatedTooltipElement = createAnchoredPopupElement({
            className: 'tooltip',
            id: DELEGATED_TOOLTIP_ID,
        });

        const { signal } = /** @type {AbortController} */ (this.#bodyAbortController);

        this.#delegatedTooltipElement.addEventListener(
            'mouseenter',
            () => {
                this.#cancelDelegatedHide();
            },
            { signal },
        );

        this.#delegatedTooltipElement.addEventListener(
            'mouseleave',
            (event) => {
                if (this.#shouldKeepDelegatedTooltipAlive(event.relatedTarget)) return;
                this.#hideDelegatedTooltip();
            },
            { signal },
        );

        // Observer is created here but only attached while a delegated tooltip is
        // actively shown (see #showDelegatedTooltip / #hideDelegatedTooltipImmediate).
        // Keeping it permanently observing document.body subtree caused measurable
        // overhead during heavy DOM churn (Tabulator redraws, D3 transitions).
        this.#delegatedTriggerObserver = new MutationObserver(() => {
            if (
                this.#activeDelegatedTooltipTrigger &&
                !this.#activeDelegatedTooltipTrigger.isConnected
            ) {
                this.#hideDelegatedTooltipImmediate();
            }
        });
    }

    // ========================================================================
    // TOOLTIP CONTENT BUILDER
    // ========================================================================

    /**
     * Build structured HTML for cursor-following tooltips from
     * `{ title, subtitle, rows, footer, showDivider }`.
     * Rendered as-is: cursor-following tooltip content is not glossary-annotated.
     * @param {object} content - The structured parts to render.
     * @returns {string} The tooltip body markup.
     */
    buildHTML(content) {
        const { title, subtitle, rows = [], footer, showDivider = true } = content;

        let html = '';
        if (title) {
            html += `<div class="tooltip-title">${title}</div>`;
        }
        if (subtitle) {
            html += `<div class="tooltip-subtitle">${subtitle}</div>`;
        }
        if (rows.length > 0) {
            rows.forEach((row) => {
                html += `<div class="tooltip-row">
                    <span class="label">${row.label}:</span>
                    <strong class="value">${row.value}</strong>
                </div>`;
            });
        }
        if (footer) {
            html += showDivider
                ? `<div class="tooltip-divider">${footer}</div>`
                : `<div>${footer}</div>`;
        }

        return html;
    }

    // ========================================================================
    // GLOSSARY POPUPS
    // ========================================================================

    /**
     * Set up event delegation for `[data-glossary-key]` hover popups.
     *
     * A no-op while `glossaryAnnotator.init(...)` has not run: a host that ships no
     * glossary stamps no `[data-glossary-key]` and has nothing to delegate, so there is
     * nothing to punish it for. Nothing latches, so a later call once the annotator is
     * up still installs the listeners.
     * Safe to call multiple times — initializes only once.
     */
    initGlossaryPopups() {
        if (this.#glossaryPopupsInitialized) return;
        if (!glossaryAnnotator.isInitialized) {
            console.warn(
                'TooltipService.initGlossaryPopups(): no glossary is initialized, so glossary popups stay off',
            );
            return;
        }

        this.#glossaryPopupsInitialized = true;
        this.#ensureAnchoredPopupEnvironmentListeners();
        this.#ensureBodyListeners();
    }

    /**
     * Hide all glossary popups. Clears the entire stack.
     */
    hideGlossaryPopups() {
        this.#clearGlossaryHoverTimeout();
        this.#clearGlossaryHideTimeout();
        // Empties the stack, and #hideGlossaryLevelsAbove clears #touchOpened with it.
        this.#hideGlossaryLevelsAbove(-1);
    }

    // --- Glossary popup DOM factory ------------------------------------------

    #createGlossaryPopupElement(level) {
        return createAnchoredPopupElement({
            className: GLOSSARY_CONFIG.popupClass,
            interactive: true,
            attributes: { [GLOSSARY_CONFIG.levelAttribute]: String(level) },
            zIndex: GLOSSARY_CONFIG.baseZIndex + level,
        });
    }

    // --- Glossary level detection --------------------------------------------

    /**
     * Level of the popup containing this element, or -1 for page-level.
     * @param {Element} element - Element to locate in the popup stack.
     * @returns {number} Stack depth of the containing popup; -1 when the element sits on the page.
     */
    #getTermLevel(element) {
        const popupAncestor = this.#closestCompat(element, `.${GLOSSARY_CONFIG.popupClass}`);
        if (!popupAncestor) return -1;
        const level = popupAncestor.getAttribute(GLOSSARY_CONFIG.levelAttribute);
        return level !== null ? parseInt(level, 10) : -1;
    }

    /**
     * Level a relatedTarget belongs to, or null if outside everything.
     * @param {Element|null} target - Whatever the event reported.
     * @returns {number|null} Stack depth, or null when the target is outside every popup and term.
     */
    #findTargetLevel(target) {
        if (!target) return null;

        const popupAncestor = this.#closestCompat(target, `.${GLOSSARY_CONFIG.popupClass}`);
        if (popupAncestor) {
            const level = popupAncestor.getAttribute(GLOSSARY_CONFIG.levelAttribute);
            return level !== null ? parseInt(level, 10) : null;
        }

        const termElement = this.#closestCompat(target, GLOSSARY_CONFIG.termSelector);
        if (termElement) {
            for (const entry of this.#glossaryPopupStack) {
                if (entry.termElement === termElement) return entry.level;
            }
            return -1;
        }

        return null;
    }

    // --- Glossary event handling ---------------------------------------------

    /**
     * Find closest ancestor matching selector — works for HTML and SVG.
     * @param {Element} element - Where the walk starts.
     * @param {string} selector - Selector the ancestor must match.
     * @returns {Element|null} The nearest matching ancestor, or null when there is none.
     */
    #closestCompat(element, selector) {
        if (typeof element.closest === 'function') {
            try {
                return element.closest(selector);
            } catch {
                /* SVG edge case */
            }
        }
        if (element.matches?.(selector)) return element;
        let el = element.parentElement;
        while (el) {
            if (el.matches?.(selector)) return el;
            el = el.parentElement;
        }
        return null;
    }

    #handleGlossaryMouseOver(e) {
        if (!this.#glossaryPopupsInitialized) return;

        if (this.#isDelegatedGlossaryContext(e.target)) {
            this.#cancelDelegatedHide();
        }

        const termElement = this.#closestCompat(e.target, GLOSSARY_CONFIG.termSelector);

        // Entering a term or popup cancels any pending hide
        if (this.#glossaryHideTimeout !== null) {
            if (termElement || this.#closestCompat(e.target, `.${GLOSSARY_CONFIG.popupClass}`)) {
                this.#clearGlossaryHideTimeout();
            }
        }

        if (!termElement) return;

        // Dedup: skip if deepest popup is already for this term
        const deepest = this.#glossaryPopupStack[this.#glossaryPopupStack.length - 1];
        if (deepest && deepest.termElement === termElement) return;

        this.#clearGlossaryHoverTimeout();

        this.#glossaryHoverTimeout = setTimeout(() => {
            this.#glossaryHoverTimeout = null;
            const key = termElement.getAttribute('data-glossary-key');
            if (!key) return;
            const resolvedKey = glossaryAnnotator.resolveEntryKey(key);
            if (!resolvedKey) return;
            const newLevel = this.#getTermLevel(termElement) + 1;
            this.#showGlossaryPopup(
                /** @type {HTMLElement} */ (termElement),
                resolvedKey,
                newLevel,
            );
        }, GLOSSARY_HOVER_OPEN_DELAY);
    }

    #handleGlossaryMouseOut(e) {
        if (!this.#glossaryPopupsInitialized) return;
        if (this.#glossaryPopupStack.length === 0 && this.#glossaryHoverTimeout === null) return;

        const delegatedGlossaryContext = this.#isDelegatedGlossaryContext(e.target);

        this.#clearGlossaryHoverTimeout();

        if (this.#glossaryPopupStack.length === 0) return;

        const targetLevel = this.#findTargetLevel(e.relatedTarget);

        if (targetLevel === null) {
            this.#scheduleGlossaryHide();
            if (
                delegatedGlossaryContext &&
                !this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)
            ) {
                this.#hideDelegatedTooltip();
            }
            return;
        }

        const relatedTerm = e.relatedTarget
            ? this.#closestCompat(e.relatedTarget, GLOSSARY_CONFIG.termSelector)
            : null;

        if (relatedTerm) {
            for (let i = this.#glossaryPopupStack.length - 1; i >= 0; i--) {
                if (this.#glossaryPopupStack[i].termElement === relatedTerm) {
                    this.#hideGlossaryLevelsAbove(this.#glossaryPopupStack[i].level);
                    return;
                }
            }
        }

        if (delegatedGlossaryContext && !this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)) {
            this.#hideDelegatedTooltip();
        }

        this.#hideGlossaryLevelsAbove(targetLevel);
    }

    #clearGlossaryHoverTimeout() {
        if (this.#glossaryHoverTimeout !== null) {
            clearTimeout(this.#glossaryHoverTimeout);
            this.#glossaryHoverTimeout = null;
        }
    }

    #clearGlossaryHideTimeout() {
        if (this.#glossaryHideTimeout !== null) {
            clearTimeout(this.#glossaryHideTimeout);
            this.#glossaryHideTimeout = null;
        }
    }

    #scheduleGlossaryHide() {
        this.#clearGlossaryHideTimeout();
        this.#glossaryHideTimeout = setTimeout(() => {
            this.#glossaryHideTimeout = null;
            this.hideGlossaryPopups();
        }, HOVER_CLOSE_GRACE);
    }

    // --- Glossary popup show / hide ------------------------------------------

    /**
     * @param {HTMLElement} termElement - Term the popup is anchored to.
     * @param {string} key - Glossary key to render.
     * @param {number} level - Stack depth the popup opens at.
     * @param {boolean} [withClose] - Render a close button; true for tap-opened popups, which have no pointer to move away.
     */
    #showGlossaryPopup(termElement, key, level, withClose = false) {
        const resolvedKey = glossaryAnnotator.resolveEntryKey(key);
        if (!resolvedKey) return;

        const entry = glossaryAnnotator.getEntry(resolvedKey);
        if (!entry) return;

        this.#hideGlossaryLevelsAbove(level - 1);

        // Collect ancestor keys + this one to prevent circular refs
        const excludeKeys = new Set(this.#glossaryPopupStack.map((e) => e.key));
        excludeKeys.add(resolvedKey);

        const popup = this.#createGlossaryPopupElement(level);

        showAnchoredPopup(
            popup,
            termElement,
            {
                content: this.#buildGlossaryPopupHTML(entry, excludeKeys, withClose),
                mode: 'html',
            },
            { deferVisibility: true },
        );

        this.#glossaryPopupStack.push({ element: popup, termElement, key: resolvedKey, level });
    }

    /**
     * Close all popups with levels strictly greater than `level`.
     * @param {number} level - Stack depth to unwind back down to.
     */
    #hideGlossaryLevelsAbove(level) {
        while (this.#glossaryPopupStack.length > 0) {
            const top = this.#glossaryPopupStack[this.#glossaryPopupStack.length - 1];
            if (top.level <= level) break;

            this.#glossaryPopupStack.pop();
            hideAnchoredPopupImmediate(top.element);
            removePopupAfterTransition(
                top.element,
                POPUP_REMOVE_TRANSITION_MS,
                this.#pendingRemovalTimeouts,
            );
        }

        // The tap flag belongs to the stack, so it is cleared here rather than at
        // each caller: a mouse taking over — hovering another term, or leaving for
        // one that is not open — empties the stack through this method, and a flag
        // left true would disable scroll dismissal for every popup opened after it.
        if (this.#glossaryPopupStack.length === 0) {
            this.#touchOpened = false;
        }
    }

    /**
     * @param {object} entry - Resolved glossary entry.
     * @param {Set<string>} excludeKeys - Keys already open, so a popup never annotates its own ancestors.
     * @param {boolean} [withClose] - Prepend a close button.
     * @returns {string} The popup's inner markup.
     */
    #buildGlossaryPopupHTML(entry, excludeKeys, withClose = false) {
        // The title is text — for a payload entry it is the server's level name — so it
        // is escaped. The body is HTML by design (competenceLevelGlossary.js composes
        // payload bodies from their `<ul>` ladders) and comes from the bundled glossary
        // or from the API, which getApiBaseUrl() holds to same-origin or loopback.
        const title = escapeHtml(entry.title || '');
        const body = glossaryAnnotator.annotateHTML(entry.body || '', excludeKeys);
        // A hovered popup closes by moving the cursor away; a tapped one has no
        // such gesture and tablets have no Escape key, so it says how to close it.
        const close = withClose
            ? `<button type="button" class="${GLOSSARY_CLOSE_CLASS}" aria-label="${glossaryCloseLabel()}">${iconSvg('close')}</button>`
            : '';
        return (
            close +
            `<div class="glossary-popup-title">${title}</div>` +
            `<div class="glossary-popup-body">${body}</div>`
        );
    }
}

export const tooltipService = TooltipService.getInstance();
