/**
 * The singleton owning the element-anchored tooltip and popup lifecycle. The popup DOM
 * primitive is `anchoredPopup.js`; the chart marks' tooltips are `cursorTooltip.js`.
 *
 * Two modes, sharing the body listeners and the pointer-modality state:
 * 1. Delegated element-anchored: driven by `data-tooltip-text` (plain) or
 *    `data-tooltip-html` (rich, glossary-annotated, interactive), through a single
 *    shared popup element.
 * 2. Glossary popups: stackable, anchored, triggered by hovering
 *    `[data-glossary-key]`; on when the app's glossary is initialised.
 *
 * Both are popovers in the top layer. The label is a `hint` popover: it never closes an
 * open menu or glossary popup. The glossary popups are `manual` popovers, so opening
 * one closes no open menu (an `auto` popover would close every other one); the service
 * owns their whole dismissal: hover, the tap paths, a click outside the stack (or on a
 * lower level, which closes the levels above it), scroll and Escape.
 *
 * Neither needs per-module wiring: the app starts the service with its glossary
 * (`init`) and takes it down with itself (`dispose`).
 */

import { isActivationKey, renderIcon, trusted } from '@tba3/module-base';
import { html, nothing } from 'lit';
import { stampGlossaryTermTabStop } from '@tba3/module-base/glossary';
import {
    createAnchoredPopupElement,
    showAnchoredPopup,
    hideAnchoredPopup,
    removePopupAfterTransition,
    stopFollowingAnchor,
} from './anchoredPopup.js';
import { cursorTooltip } from './cursorTooltip.js';
import { KeyedTimers } from './keyedTimers.js';
import { isAutoPopoverOpen } from '../overlays/unclaimedEscape.js';
import './tooltipService.css';

/**
 * Close delay of the delegated and glossary popups: time for the pointer to cross the
 * gap between trigger and popup, behind the CSS `::before` bridge that covers it.
 */
const HOVER_CLOSE_GRACE_MS = 150;

const GLOSSARY_HOVER_OPEN_DELAY_MS = 500;
/** A control whose keyboard focus opens the popup of the glossary term inside it. */
const GLOSSARY_FOCUS_CONTROL_SELECTOR = '[data-glossary-focus]';

const DELEGATED_TOOLTIP_ID = 'tooltip-delegated';
/** The deferred show of a label its trigger's focus opens (`#handleDelegatedFocusIn`). */
const DELEGATED_FOCUS_SHOW_ID = 'tooltip-delegated-focus';

/** Timer keys of the glossary popups. */
const GLOSSARY_HOVER_TIMER = 'glossary-hover';
const GLOSSARY_HIDE_TIMER = 'glossary-hide';
const DELEGATED_TOOLTIP_SELECTOR = '[data-tooltip-text], [data-tooltip-html]';

/**
 * Give a focused control its plain tooltip as `aria-description` when the tooltip says
 * more than the name (why a choice is unavailable, what a preset does), so assistive
 * tech hears what only the tooltip shows. Stamped synchronously in `focusin`, before the
 * browser reports the focus, and refreshed on every focus, so a tooltip that changed
 * with the control's state is read as it is now.
 * @param {EventTarget|null} target - The element that took focus.
 */
function describeByTooltip(target) {
    if (!(target instanceof HTMLElement)) return;
    const text = target.getAttribute('data-tooltip-text')?.trim();
    const name = (target.getAttribute('aria-label') ?? target.textContent ?? '').trim();
    // A tooltip since removed or now equal to the name takes its description with it.
    if (!text || text === name) target.removeAttribute('aria-description');
    else target.setAttribute('aria-description', text);
}

const GLOSSARY_CONFIG = {
    popupClass: 'glossary-popup',
    termSelector: '[data-glossary-key]',
};

/** Dismiss button, rendered only into tap-opened glossary popups. */
const GLOSSARY_CLOSE_CLASS = 'glossary-popup-close';

/** Numbers the glossary popups' ids, which their terms point at while they are open. */
let glossaryPopupCount = 0;

/**
 * Tell assistive tech whether a term's popup is open, and where it is: the popup sits
 * at the end of the page, far from its term in reading order. Only a term that is a
 * button (a tab stop) carries the expanded state and `aria-controls`; an SVG label or a
 * term inside a control is still described by the open popup.
 * @param {Element} term
 * @param {HTMLElement|null} popup - The open popup; null once it closed.
 */
function markExpanded(term, popup) {
    const isButton = term.getAttribute('role') === 'button';
    if (isButton) term.setAttribute('aria-expanded', String(popup !== null));
    if (popup) {
        if (isButton) term.setAttribute('aria-controls', popup.id);
        term.setAttribute('aria-describedby', popup.id);
    } else {
        term.removeAttribute('aria-controls');
        term.removeAttribute('aria-describedby');
    }
}

class TooltipService {
    /**
     * Every pending timer: the delegated popup's close under `DELEGATED_TOOLTIP_ID` and
     * its focus show under `DELEGATED_FOCUS_SHOW_ID`, and the glossary's open and close
     * under their `GLOSSARY_*_TIMER` keys.
     */
    #timers = new KeyedTimers();

    /** @type {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator|null} The app's glossary, set by `init`; annotates rich tooltips and backs the popups. */
    #glossary = null;

    // --- Delegated (anchored) tooltip state ----------------------------------

    /** @type {HTMLDivElement|null} Set by `init`, so non-null while delegated tooltips are on. */
    #delegatedTooltipElement = null;
    /** @type {HTMLElement|null} */
    #activeDelegatedTooltipTrigger = null;
    /** @type {MutationObserver|null} */
    #delegatedTriggerObserver = null;
    /** @type {AbortController|null} The shown label's surface watch; see #dropLabelWithItsSurface */
    #labelSurfaceWatch = null;

    // --- Glossary popup state ------------------------------------------------

    #glossaryPopupsInitialized = false;
    /**
     * The open glossary popups, outermost first; a popup's level is its index.
     * @type {Array<{element: HTMLDivElement, termElement: Element, key: string}>}
     */
    #glossaryPopupStack = [];

    /** @type {AbortController|null} The page listeners, while installed; `dispose` aborts them. */
    #listeners = null;

    /**
     * Modality of the interaction in progress: the last `pointerType` seen.
     * A tap on iPadOS also fires simulated mouse events, so every hover path
     * below consults this instead of guessing from timing. An iPad trackpad
     * reports `mouse` and switches the paths back on its own.
     *
     * Three modalities, two paths: `mouse` gets the hover path only, `touch` the
     * tap path only, and `pen` both, since some pens hover (and open on dwell) and
     * others can only tap.
     * @type {string}
     */
    #lastPointerType = 'mouse';

    /** @type {boolean} Whether the open glossary stack was opened by a tap. */
    #touchOpened = false;

    /**
     * The label trigger under the last press whose label was open at that moment. As a
     * `hint` the label is light-dismissed when the press ends (its anchor is outside
     * it), so by the tap's `click` it is already gone, and without this record the tap
     * would open it again.
     * @type {Element|null}
     */
    #pressedOpenAnchor = null;

    // ========================================================================
    // PAGE LISTENERS (shared by delegated + glossary)
    // ========================================================================

    /**
     * Register the page listeners once per `init`; `dispose` removes them.
     *
     * The hover handlers guard themselves with their own initialization flags. On touch
     * they return immediately: a tap on iPadOS emits simulated mouse events, which would
     * open popups late, close them unpredictably and never nest them.
     */
    #installListeners() {
        if (this.#listeners) return;
        this.#listeners = new AbortController();
        const { signal } = this.#listeners;

        const throttle = (/** @type {() => void} */ hide) => {
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

        // A scroll that moves its anchor dismisses a hovered popup, whose cursor has left
        // the anchor, and always a cursor tooltip, which it detaches from its mark. In the
        // capture phase: the shell scrolls inside its views and cards, whose scroll events
        // never bubble. A scroll elsewhere (inside a popup, a table redrawing) leaves both.
        // A tapped-open popup stays: anchoredPopup.js keeps it at its term, and reading
        // it means scrolling. Resize dismisses both (a rotation invalidates the anchor).
        window.addEventListener(
            'scroll',
            (event) => {
                const scrolled =
                    event.target instanceof Element ? event.target : document.documentElement;
                cursorTooltip.hide(scrolled);
                if (this.#touchOpened) return;
                const label = this.#activeDelegatedTooltipTrigger;
                if (label && scrolled.contains(label)) this.#hideDelegatedTooltipImmediate();
                const rootTerm = this.#glossaryPopupStack[0]?.termElement;
                if (rootTerm && scrolled.contains(rootTerm)) this.#hideGlossaryPopups();
            },
            { capture: true, passive: true, signal },
        );
        window.addEventListener(
            'resize',
            throttle(() => this.#hideAllAnchoredPopups()),
            { passive: true, signal },
        );
        // Escape closes the label and the whole glossary stack at once, and claims the
        // press: the dialog, menu or drawer they sit in stays open until the next Escape,
        // so a label is dismissed without moving focus. In the capture phase, so the
        // claim is made before any surface's own handler reads it.
        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Escape') return;
                // Focus inside a popup would fall to <body> with it: it goes back to
                // the page term the stack opened from.
                const root = this.#glossaryPopupStack[0]?.termElement;
                const focusInStack = this.#glossaryPopupStack.some((entry) =>
                    entry.element.contains(document.activeElement),
                );
                const labelOpen = this.#delegatedTooltipElement?.matches(':popover-open');
                // A mark's tooltip, also while the pointer rests on the mark and focus
                // is elsewhere: dismissed until the pointer leaves it. It claims the press
                // only when no menu is open, which the browser closes on this Escape.
                const markTooltipOpen = cursorTooltip.dismiss() && !isAutoPopoverOpen();
                this.#hideAllAnchoredPopups();
                if (!root && !labelOpen && !markTooltipOpen) return;
                event.preventDefault();
                if (focusInStack && root instanceof HTMLElement) {
                    root.focus();
                    // That keyboard focus would open the popup again once it rests.
                    this.#timers.cancel(GLOSSARY_HOVER_TIMER);
                }
            },
            { capture: true, signal },
        );

        // Capture, and `pointerover` as well as `pointerdown`: `pointerover` precedes
        // `mouseover` in the same interaction, so the hover handlers below see the
        // right modality on the first event.
        const recordPointerType = (/** @type {PointerEvent} */ e) => {
            this.#lastPointerType = e.pointerType || 'mouse';
        };
        document.body.addEventListener('pointerover', recordPointerType, { capture: true, signal });
        document.body.addEventListener(
            'pointerdown',
            (e) => {
                recordPointerType(e);
                this.#recordPressedOpenAnchor(e.target);
            },
            { capture: true, signal },
        );

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

        // A term is a tab stop: keyboard focus resting on it opens its popup, as a
        // hover does, Enter or Space opens it at once, and focus leaving for anything
        // outside the stack closes it. An icon button's label follows its focus.
        document.body.addEventListener(
            'focusin',
            (e) => {
                describeByTooltip(e.target);
                this.#handleDelegatedFocusIn(e);
                this.#handleGlossaryFocusIn(e);
            },
            { signal },
        );
        document.body.addEventListener(
            'focusout',
            (e) => {
                this.#handleDelegatedFocusOut(e);
                this.#handleGlossaryFocusOut(e);
            },
            { signal },
        );
        document.body.addEventListener('keydown', (e) => this.#handleGlossaryKeyDown(e), {
            signal,
        });

        // Capture, not bubble: chart click handlers call stopPropagation(), so a
        // bubble-phase listener would never fire for a tap on a mark. Nothing here
        // calls preventDefault, so the trigger's own click still runs.
        document.body.addEventListener('click', (e) => this.#handleTouchTap(e), {
            capture: true,
            signal,
        });
    }

    /**
     * Note whether a press lands on the trigger of the open label, before light dismiss
     * closes it.
     * @param {EventTarget|null} target
     */
    #recordPressedOpenAnchor(target) {
        this.#pressedOpenAnchor = null;
        if (!(target instanceof Element)) return;
        const trigger = this.#activeDelegatedTooltipTrigger;
        if (trigger?.contains(target) && this.#delegatedTooltipElement?.matches(':popover-open')) {
            this.#pressedOpenAnchor = trigger;
        }
    }

    #hideAllAnchoredPopups() {
        this.#hideDelegatedTooltipImmediate();
        this.#hideGlossaryPopups();
    }

    /**
     * The glossary stack's light dismiss, for every pointer: a click outside the stack
     * closes it, a click in a lower level closes the levels above it. Then the touch
     * counterpart of the hover handlers: one tap opens, the next closes, and a tap
     * outside dismisses the label. That part runs for a finger or a pen, no-op for a
     * mouse, except for the popup's own close button, which is handled whatever the
     * modality is.
     *
     * A tap never steals the trigger's own click: a glossary term inside a button or
     * link is skipped, since its view may be about to be replaced.
     * @param {MouseEvent} event - A body `click`, in the capture phase.
     */
    #handleTouchTap(event) {
        if (!(event.target instanceof Element)) return;
        const target = event.target;

        // Ahead of the modality gate: the button is rendered only into a tap-opened
        // popup, and the modality can flip to mouse between the tap that rendered it
        // and the press that dismisses it (a tablet's trackpad, a keyboard activation
        // after a mouse click elsewhere).
        const closeButton = target.closest(`.${GLOSSARY_CLOSE_CLASS}`);
        if (closeButton) {
            // A popup still fading out has already left the stack (level -1): nothing
            // is left to close, and `-2` would unwind past the empty stack.
            const level = this.#popupLevel(closeButton);
            if (level !== -1) this.#hideGlossaryLevelsAbove(level - 1);
            return;
        }

        this.#dismissGlossaryLevelsOutside(target);

        // `!== 'mouse'`, not `=== 'touch'`: a pen takes the tap path too.
        if (this.#lastPointerType === 'mouse') return;

        // `detail` is 0 for a keyboard activation and for a programmatic click(),
        // 1 for a real tap. #lastPointerType holds whatever the last pointer
        // reported, so without this an Enter press after a tap would take the tap
        // path and pop the focused button's own label.
        if (event.detail === 0) return;

        // A pen tap arms the hover-open timer through the compat mouseover that
        // precedes this click; leaving it running would replace the popup opened
        // below with a close-button-less twin 500 ms later. No-op for a finger,
        // which fires no compat mouseover.
        this.#timers.cancel(GLOSSARY_HOVER_TIMER);

        const term = target.closest(GLOSSARY_CONFIG.termSelector);
        if (term && this.#glossaryPopupsInitialized && !term.closest('button, a')) {
            this.#toggleGlossaryPopupForTerm(term);
            return;
        }

        // Reading inside an open popup must not dismiss it.
        if (target.closest(`.${GLOSSARY_CONFIG.popupClass}`)) return;

        const trigger = target.closest(DELEGATED_TOOLTIP_SELECTOR);
        if (trigger && this.#delegatedTooltipElement) {
            this.#toggleDelegatedTooltip(/** @type {HTMLElement} */ (trigger));
            return;
        }

        if (this.#delegatedTooltipElement?.contains(target)) return;

        // The label's own dismissal. As a `hint` it is light-dismissed too, but only
        // where the browser knows `hint`; elsewhere it is a manual popover.
        this.#hideDelegatedTooltipImmediate();

        // Cursor tooltips are opened by the `mouseenter` that Chromium synthesises
        // before this click, so sweeping them here would kill the one this tap just
        // opened; `pointerdown` also fires when a scroll gesture begins. So a chart
        // keeps its tooltip until the next mark or a tap outside the chart.
        if (!target.closest('.chart-container')) cursorTooltip.hide();
    }

    /**
     * Close the glossary levels a click lands above: the click's own level stays (the
     * popup it is in, or the one an open term it hit opened) and everything over it
     * goes; a click on the page closes the whole stack.
     * @param {Element} target
     */
    #dismissGlossaryLevelsOutside(target) {
        if (this.#glossaryPopupStack.length === 0) return;
        const term = target.closest(GLOSSARY_CONFIG.termSelector);
        const termLevel = term
            ? this.#glossaryPopupStack.findIndex((entry) => entry.termElement === term)
            : -1;
        this.#hideGlossaryLevelsAbove(termLevel !== -1 ? termLevel : this.#popupLevel(target));
    }

    /**
     * Second tap on the same term closes it; otherwise open it at the next level,
     * without the hover delay.
     * @param {Element} term
     */
    #toggleGlossaryPopupForTerm(term) {
        this.#timers.cancel(GLOSSARY_HOVER_TIMER);
        this.#timers.cancel(GLOSSARY_HIDE_TIMER);

        const open = this.#glossaryPopupStack.findIndex((entry) => entry.termElement === term);
        if (open !== -1) {
            this.#hideGlossaryLevelsAbove(open - 1);
            return;
        }

        this.#showGlossaryPopup(term, { withClose: true });
        // Read off the stack, not set ahead of the show: #showGlossaryPopup bails on
        // a key the glossary does not carry, and a flag left true with nothing open
        // would disable scroll dismissal for every popup opened after it.
        this.#touchOpened = this.#glossaryPopupStack.length > 0;
    }

    /**
     * Show or hide the label of an icon-only button. The button's own click runs
     * either way; only the label is toggled.
     * @param {HTMLElement} trigger
     */
    #toggleDelegatedTooltip(trigger) {
        // Light dismiss may already have closed it when the press ended.
        const isShowing =
            (trigger === this.#activeDelegatedTooltipTrigger &&
                this.#delegatedTooltipElement?.matches(':popover-open')) ||
            trigger === this.#pressedOpenAnchor;
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
     * has not run yet, and it may be the one that closes that surface (a modal's
     * "Abbrechen", a drawer's close). The disconnect watcher in
     * #showDelegatedTooltip does not cover it: those surfaces are closed, not
     * removed, so the trigger stays connected.
     *
     * Checked once on the next frame and then after each transition that ends,
     * because a surface fades: one frame after the class comes off, its opacity is
     * still ~1 and `visibility` has not flipped yet. The watch ends with the label:
     * hiding it, or showing another, aborts it.
     * @param {HTMLElement} trigger
     */
    #dropLabelWithItsSurface(trigger) {
        this.#labelSurfaceWatch = new AbortController();
        const { signal } = this.#labelSurfaceWatch;
        const dropIfHidden = () => {
            if (!trigger.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
                this.#hideDelegatedTooltipImmediate();
            }
        };

        requestAnimationFrame(() => {
            if (signal.aborted) return;
            dropIfHidden();
            if (signal.aborted) return;
            document.body.addEventListener('transitionend', dropIfHidden, {
                capture: true,
                signal,
            });
        });
    }

    // ========================================================================
    // DELEGATED ELEMENT-ANCHORED TOOLTIPS
    // ========================================================================

    /**
     * Resolve delegated tooltip payload from a trigger element.
     *  - `data-tooltip-html` → rich HTML (annotated, interactive)
     *  - `data-tooltip-text` → plain text (non-interactive)
     * @param {Element|null} trigger
     * @returns {{content: string, mode: string}|null} Null when the trigger carries neither.
     */
    #getDelegatedTooltipPayload(trigger) {
        if (!trigger) return null;
        const htmlContent = trigger.getAttribute('data-tooltip-html');
        if (htmlContent) return { content: htmlContent, mode: 'html' };
        const textContent = trigger.getAttribute('data-tooltip-text');
        if (textContent) return { content: textContent, mode: 'text' };
        return null;
    }

    /**
     * Is the event target inside the active delegated trigger or popup?
     * @param {EventTarget|null} target
     * @returns {boolean}
     */
    #isWithinDelegatedSurface(target) {
        if (!(target instanceof Element)) return false;

        return Boolean(
            this.#activeDelegatedTooltipTrigger?.contains(target) ||
            this.#delegatedTooltipElement?.contains(target),
        );
    }

    /**
     * Is the target a glossary interaction spawned from the active delegated popup?
     * @param {EventTarget|null} target
     * @returns {boolean} True when dismissing would close a popup the user is still using.
     */
    #isDelegatedGlossaryContext(target) {
        if (!(target instanceof Element) || !this.#activeDelegatedTooltipTrigger) return false;

        const popupAncestor = target.closest(`.${GLOSSARY_CONFIG.popupClass}`);
        if (popupAncestor) {
            const entry = this.#glossaryPopupStack.find((e) => e.element === popupAncestor);
            return !!entry && this.#isWithinDelegatedSurface(entry.termElement);
        }

        const termElement = target.closest(GLOSSARY_CONFIG.termSelector);
        return !!termElement && this.#isWithinDelegatedSurface(termElement);
    }

    /**
     * @param {EventTarget|null} target
     * @returns {boolean} True while the pointer is on the tooltip surface or a glossary popup it opened.
     */
    #shouldKeepDelegatedTooltipAlive(target) {
        return this.#isWithinDelegatedSurface(target) || this.#isDelegatedGlossaryContext(target);
    }

    /**
     * Native title tooltips conflict with delegated tooltip ownership.
     * @param {Element|null} trigger
     */
    #stripNativeTitleTooltip(trigger) {
        if (!(trigger instanceof Element) || !trigger.hasAttribute('title')) return;
        trigger.removeAttribute('title');
    }

    /**
     * @param {HTMLElement} trigger
     * @param {{content: string, mode: string}} payload - What it says (`#getDelegatedTooltipPayload`).
     */
    #showDelegatedTooltip(trigger, payload) {
        if (!this.#delegatedTooltipElement) return;
        // A popover keeps the invoker it was shown with: moving to another trigger, the
        // label is shown anew, so focus order and popover nesting follow the new one.
        if (
            trigger !== this.#activeDelegatedTooltipTrigger &&
            this.#delegatedTooltipElement.matches(':popover-open')
        ) {
            this.#hideDelegatedTooltipImmediate();
        }

        this.#timers.cancel(DELEGATED_TOOLTIP_ID);
        this.#labelSurfaceWatch?.abort();
        this.#stripNativeTitleTooltip(trigger);
        this.#activeDelegatedTooltipTrigger = trigger;

        // Re-arm the disconnect-watcher (see `init`).
        this.#delegatedTriggerObserver?.observe(document.body, { childList: true, subtree: true });

        // `data-tooltip-html` is markup its writer vouched for (`setTooltipContent`
        // escapes every value), annotated here with the glossary's terms.
        const content =
            payload.mode === 'html'
                ? trusted(this.#glossary?.annotateHTML(payload.content) ?? payload.content)
                : payload.content;
        // Only a rich label takes the pointer, so its glossary terms are reachable. A text
        // label stays click-through: it sits over the menu its trigger opens below it.
        showAnchoredPopup(this.#delegatedTooltipElement, trigger, content, {
            interactive: payload.mode === 'html',
        });
    }

    #hideDelegatedTooltip() {
        if (!this.#delegatedTooltipElement) return;
        if (this.#delegatedTooltipElement.classList.contains('is-interactive')) {
            this.#timers.schedule(DELEGATED_TOOLTIP_ID, HOVER_CLOSE_GRACE_MS, () =>
                this.#hideDelegatedTooltipImmediate(),
            );
            return;
        }
        this.#hideDelegatedTooltipImmediate();
    }

    #hideDelegatedTooltipImmediate() {
        if (!this.#delegatedTooltipElement) return;
        this.#forgetDelegatedTooltip();
        hideAnchoredPopup(this.#delegatedTooltipElement);
    }

    /**
     * Drop the shown label's state: on every hide, the service's own and the
     * browser's (light dismiss, or an `auto` popover opening over it).
     */
    #forgetDelegatedTooltip() {
        this.#timers.cancel(DELEGATED_TOOLTIP_ID);
        this.#labelSurfaceWatch?.abort();
        this.#labelSurfaceWatch = null;
        this.#activeDelegatedTooltipTrigger = null;
        if (this.#delegatedTooltipElement) stopFollowingAnchor(this.#delegatedTooltipElement);
        // Pause the disconnect-watcher until the next show.
        this.#delegatedTriggerObserver?.disconnect();
    }

    /** @param {MouseEvent} e - A body `mouseover`. */
    #handleDelegatedMouseOver(e) {
        if (!this.#delegatedTooltipElement) return;
        if (!(e.target instanceof Element)) return;

        const trigger = /** @type {HTMLElement|null} */ (
            e.target.closest(DELEGATED_TOOLTIP_SELECTOR)
        );
        if (!trigger) return;

        const payload = this.#getDelegatedTooltipPayload(trigger);
        if (!payload) return;

        if (trigger === this.#activeDelegatedTooltipTrigger) {
            this.#timers.cancel(DELEGATED_TOOLTIP_ID);
            if (this.#delegatedTooltipElement?.matches(':popover-open')) return;
        }

        this.#showDelegatedTooltip(trigger, payload);
    }

    /** @param {FocusEvent} e - A body `focusin`. */
    #handleDelegatedFocusIn(e) {
        if (!this.#delegatedTooltipElement) return;
        const target = e.target instanceof Element ? e.target : null;
        if (!target?.matches(':focus-visible')) return;
        const trigger = /** @type {HTMLElement|null} */ (
            target.closest(DELEGATED_TOOLTIP_SELECTOR)
        );
        const payload = this.#getDelegatedTooltipPayload(trigger);
        if (!trigger || !payload) return;
        // Focus a closing menu or dialog hands back to its trigger is no visit: a label
        // there would take the next Escape, which is meant for the surface.
        const overlayLeft =
            e.relatedTarget instanceof Element && e.relatedTarget.closest('[popover], dialog');
        if (overlayLeft && !overlayLeft.contains(target)) return;
        // Focus can arrive from inside another popover's hide (Escape hands it back to the
        // menu's trigger), where showPopover throws; the label waits for the next task.
        this.#timers.schedule(DELEGATED_FOCUS_SHOW_ID, 0, () => {
            if (document.activeElement === target) this.#showDelegatedTooltip(trigger, payload);
        });
    }

    /** @param {FocusEvent} e - A body `focusout`. */
    #handleDelegatedFocusOut(e) {
        if (!(e.target instanceof Element)) return;
        const trigger = e.target.closest(DELEGATED_TOOLTIP_SELECTOR);
        if (!trigger || trigger !== this.#activeDelegatedTooltipTrigger) return;
        if (this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)) return;
        this.#hideDelegatedTooltipImmediate();
    }

    /** @param {MouseEvent} e - A body `mouseout`. */
    #handleDelegatedMouseOut(e) {
        if (!this.#delegatedTooltipElement) return;
        if (!(e.target instanceof Element)) return;

        const trigger = e.target.closest(DELEGATED_TOOLTIP_SELECTOR);
        if (!trigger || trigger !== this.#activeDelegatedTooltipTrigger) return;

        if (e.relatedTarget instanceof Node && trigger.contains(e.relatedTarget)) return;
        if (this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)) return;

        this.#hideDelegatedTooltip();
    }

    /**
     * Turn on the delegated tooltips for `data-tooltip-text` / `data-tooltip-html`, and
     * the glossary popups over `[data-glossary-key]` once a glossary is initialised (a
     * host that ships none stamps no term). Call once per app with its glossary; a repeat
     * call swaps in the new glossary and keeps the listeners and the shared tooltip
     * element. `dispose` undoes it.
     * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator|null} glossary - The app's glossary; null for a host that ships none.
     */
    init(glossary) {
        this.#installListeners();
        this.#glossary = glossary;
        if (glossary?.isInitialized) {
            this.#glossaryPopupsInitialized = true;
            // The term affordance (dotted underline, help cursor) is gated on this in
            // glossary-popup.css: without a popup behind it, a term is plain text.
            document.documentElement.dataset.glossary = '';
        }
        if (this.#delegatedTooltipElement) return;

        this.#delegatedTooltipElement = createAnchoredPopupElement({
            className: 'tooltip',
            id: DELEGATED_TOOLTIP_ID,
            popover: 'hint',
        });

        this.#delegatedTooltipElement.addEventListener('beforetoggle', (event) => {
            if (event.newState === 'closed') this.#forgetDelegatedTooltip();
        });

        this.#delegatedTooltipElement.addEventListener('mouseenter', () => {
            this.#timers.cancel(DELEGATED_TOOLTIP_ID);
        });

        this.#delegatedTooltipElement.addEventListener('mouseleave', (event) => {
            if (this.#shouldKeepDelegatedTooltipAlive(event.relatedTarget)) return;
            this.#hideDelegatedTooltip();
        });

        // Attached only while a delegated tooltip is shown: observing the body
        // subtree permanently costs during heavy DOM churn (Tabulator redraws, D3
        // transitions).
        this.#delegatedTriggerObserver = new MutationObserver(() => {
            if (
                this.#activeDelegatedTooltipTrigger &&
                !this.#activeDelegatedTooltipTrigger.isConnected
            ) {
                this.#hideDelegatedTooltipImmediate();
            }
        });
    }

    /**
     * Take the service down with the app that started it: close every popup, remove
     * the page listeners and the shared tooltip element, and forget the glossary, so a
     * later `init` starts from scratch. A no-op when it is not running.
     */
    dispose() {
        this.#hideAllAnchoredPopups();
        this.#timers.clear();
        this.#listeners?.abort();
        this.#listeners = null;
        this.#delegatedTriggerObserver?.disconnect();
        this.#delegatedTriggerObserver = null;
        this.#delegatedTooltipElement?.remove();
        this.#delegatedTooltipElement = null;
        this.#glossaryPopupsInitialized = false;
        this.#glossary = null;
        this.#lastPointerType = 'mouse';
        delete document.documentElement.dataset.glossary;
    }

    // ========================================================================
    // GLOSSARY POPUPS
    // ========================================================================

    #hideGlossaryPopups() {
        this.#timers.cancel(GLOSSARY_HOVER_TIMER);
        this.#timers.cancel(GLOSSARY_HIDE_TIMER);
        this.#hideGlossaryLevelsAbove(-1);
    }

    // --- Glossary level detection --------------------------------------------

    /**
     * Level of the popup containing this element (its index in the stack), or -1
     * for an element on the page.
     * @param {Element} element
     * @returns {number}
     */
    #popupLevel(element) {
        const popup = element.closest(`.${GLOSSARY_CONFIG.popupClass}`);
        return popup ? this.#glossaryPopupStack.findIndex((entry) => entry.element === popup) : -1;
    }

    /**
     * Level a relatedTarget belongs to: the popup it is in, or the popup its term opened
     * (-1 for a term with none open); null outside every popup and term.
     * @param {EventTarget|null} target
     * @returns {number|null}
     */
    #findTargetLevel(target) {
        if (!(target instanceof Element)) return null;
        if (target.closest(`.${GLOSSARY_CONFIG.popupClass}`)) {
            const level = this.#popupLevel(target);
            return level === -1 ? null : level;
        }
        const termElement = target.closest(GLOSSARY_CONFIG.termSelector);
        if (!termElement) return null;
        return this.#glossaryPopupStack.findIndex((entry) => entry.termElement === termElement);
    }

    // --- Glossary event handling ---------------------------------------------

    /** @param {MouseEvent} e - A body `mouseover`. */
    #handleGlossaryMouseOver(e) {
        if (!this.#glossaryPopupsInitialized) return;

        if (this.#isDelegatedGlossaryContext(e.target)) {
            this.#timers.cancel(DELEGATED_TOOLTIP_ID);
        }

        const target = e.target instanceof Element ? e.target : null;
        const termElement = target?.closest(GLOSSARY_CONFIG.termSelector);

        if (this.#timers.has(GLOSSARY_HIDE_TIMER)) {
            if (termElement || target?.closest(`.${GLOSSARY_CONFIG.popupClass}`)) {
                this.#timers.cancel(GLOSSARY_HIDE_TIMER);
            }
        }

        if (!termElement) return;

        const deepest = this.#glossaryPopupStack[this.#glossaryPopupStack.length - 1];
        if (deepest && deepest.termElement === termElement) return;

        this.#timers.cancel(GLOSSARY_HOVER_TIMER);

        this.#timers.schedule(GLOSSARY_HOVER_TIMER, GLOSSARY_HOVER_OPEN_DELAY_MS, () =>
            this.#showGlossaryPopup(termElement),
        );
    }

    /** @param {MouseEvent} e - A body `mouseout`. */
    #handleGlossaryMouseOut(e) {
        if (!this.#glossaryPopupsInitialized) return;
        if (this.#glossaryPopupStack.length === 0 && !this.#timers.has(GLOSSARY_HOVER_TIMER))
            return;

        const delegatedGlossaryContext = this.#isDelegatedGlossaryContext(e.target);

        this.#timers.cancel(GLOSSARY_HOVER_TIMER);

        if (this.#glossaryPopupStack.length === 0) return;

        const targetLevel = this.#findTargetLevel(e.relatedTarget);

        if (targetLevel === null) {
            this.#timers.schedule(GLOSSARY_HIDE_TIMER, HOVER_CLOSE_GRACE_MS, () =>
                this.#hideGlossaryPopups(),
            );
            if (
                delegatedGlossaryContext &&
                !this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)
            ) {
                this.#hideDelegatedTooltip();
            }
            return;
        }

        const relatedTerm =
            e.relatedTarget instanceof Element
                ? e.relatedTarget.closest(GLOSSARY_CONFIG.termSelector)
                : null;

        if (relatedTerm) {
            for (let i = this.#glossaryPopupStack.length - 1; i >= 0; i--) {
                if (this.#glossaryPopupStack[i].termElement === relatedTerm) {
                    this.#hideGlossaryLevelsAbove(i);
                    return;
                }
            }
        }

        if (delegatedGlossaryContext && !this.#shouldKeepDelegatedTooltipAlive(e.relatedTarget)) {
            this.#hideDelegatedTooltip();
        }

        this.#hideGlossaryLevelsAbove(targetLevel);
    }

    /**
     * Open a keyboard-focused term's popup once focus rests on it for the hover delay,
     * so tabbing past opens nothing. A control that carries a term it cannot make a tab
     * stop of (`data-glossary-focus`: a legend pill, a sortable header) opens that term's
     * popup the same way. Focus a click gave keeps the hover path: it is not `:focus-visible`.
     * @param {FocusEvent} e - A body `focusin`.
     */
    #handleGlossaryFocusIn(e) {
        if (!this.#glossaryPopupsInitialized) return;
        const target = e.target instanceof Element ? e.target : null;
        if (!target?.matches(':focus-visible')) return;
        const control = target.matches(GLOSSARY_FOCUS_CONTROL_SELECTOR) ? target : null;
        const term = control
            ? control.querySelector(GLOSSARY_CONFIG.termSelector)
            : target.matches(GLOSSARY_CONFIG.termSelector)
              ? target
              : null;
        if (!term) return;
        this.#timers.cancel(GLOSSARY_HOVER_TIMER);
        this.#timers.cancel(GLOSSARY_HIDE_TIMER);
        if (this.#glossaryPopupStack.some((entry) => entry.termElement === term)) return;
        this.#timers.schedule(GLOSSARY_HOVER_TIMER, GLOSSARY_HOVER_OPEN_DELAY_MS, () =>
            this.#showGlossaryPopup(term, { asDialog: true }),
        );
    }

    /**
     * Enter or Space on a focused term opens its popup without the delay: the term is a
     * `role="button"`. On a term whose popup is open, Enter moves focus into it, where
     * its own terms are tab stops (the keyboard's way to a nested term), and Space
     * closes it. Escape brings focus back.
     * @param {KeyboardEvent} e - A body `keydown`.
     */
    #handleGlossaryKeyDown(e) {
        if (!this.#glossaryPopupsInitialized) return;
        if (!isActivationKey(e)) return;
        const term = e.target instanceof Element ? e.target : null;
        if (!term?.matches(GLOSSARY_CONFIG.termSelector)) return;
        e.preventDefault();
        this.#timers.cancel(GLOSSARY_HOVER_TIMER);
        const open = this.#glossaryPopupStack.findIndex((entry) => entry.termElement === term);
        if (open === -1) {
            this.#showGlossaryPopup(term, { asDialog: true });
            return;
        }
        if (e.key !== 'Enter') {
            this.#hideGlossaryLevelsAbove(open - 1);
            return;
        }
        // A popup the pointer opened is a label; the keyboard's is a dialog to enter.
        if (this.#glossaryPopupStack[open].element.getAttribute('role') !== 'dialog') {
            this.#hideGlossaryLevelsAbove(open - 1);
            this.#showGlossaryPopup(term, { asDialog: true });
        }
        const popup = this.#glossaryPopupStack.find((entry) => entry.termElement === term)?.element;
        if (!popup) return;
        // Its terms become stops only now: the popup follows its term in the focus
        // order, so stops there from the start would be the next Tab's, a chain of
        // popups opening one after another.
        for (const nested of popup.querySelectorAll(GLOSSARY_CONFIG.termSelector)) {
            stampGlossaryTermTabStop(nested);
        }
        popup.tabIndex = -1;
        /** @type {HTMLElement} */ (popup.querySelector('[tabindex="0"]') ?? popup).focus();
    }

    /**
     * Focus leaving a term or a popup: keep the levels up to the one it moves into, close
     * the rest (all of them when it leaves the stack).
     * @param {FocusEvent} e - A body `focusout`.
     */
    #handleGlossaryFocusOut(e) {
        if (!this.#glossaryPopupsInitialized) return;
        const source = e.target instanceof Element ? e.target : null;
        if (
            !source?.closest(
                `${GLOSSARY_CONFIG.termSelector}, .${GLOSSARY_CONFIG.popupClass}, ${GLOSSARY_FOCUS_CONTROL_SELECTOR}`,
            )
        ) {
            return;
        }
        // A control left before its delay ran out opens nothing.
        this.#timers.cancel(GLOSSARY_HOVER_TIMER);
        if (this.#glossaryPopupStack.length === 0) return;
        // Focus moving to nothing is a press on plain content, or the window losing
        // focus: the click's light dismiss decides about a press, and one inside the
        // stack (a tap on a popup's text after a tap on its term) keeps it open.
        if (!(e.relatedTarget instanceof Element)) return;
        const targetLevel = this.#findTargetLevel(e.relatedTarget);
        if (targetLevel === null) this.#hideGlossaryPopups();
        else this.#hideGlossaryLevelsAbove(targetLevel);
    }

    // --- Glossary popup show / hide ------------------------------------------

    /**
     * Open a term's popup one level above the popup the term sits in (or at the root).
     * A popup the keyboard or a tap opens is a dialog named by its entry's title, whose
     * terms are tab stops; one the pointer's hover opens is a label, whose terms the
     * pointer reaches.
     * @param {Element} termElement - Term the popup is anchored to: HTML text or an SVG label; its `data-glossary-key` is a canonical key or an alias.
     * @param {{withClose?: boolean, asDialog?: boolean}} [options] - `withClose` renders a close button, for tap-opened popups, which have no pointer to move away; it makes the popup a dialog too.
     */
    #showGlossaryPopup(termElement, { withClose = false, asDialog = withClose } = {}) {
        const rawKey = termElement.getAttribute('data-glossary-key');
        const level = this.#popupLevel(termElement) + 1;
        const glossary = this.#glossary;
        const resolvedKey = rawKey && glossary ? glossary.resolveEntryKey(rawKey) : null;
        const entry = resolvedKey && glossary ? glossary.getEntry(resolvedKey) : null;
        if (!glossary || !resolvedKey || !entry) return;

        this.#hideGlossaryLevelsAbove(level - 1);

        // The ancestors' keys and this one are not annotated in the body: no cycles.
        const excludeKeys = new Set(this.#glossaryPopupStack.map((e) => e.key));
        excludeKeys.add(resolvedKey);

        const popup = createAnchoredPopupElement({
            className: GLOSSARY_CONFIG.popupClass,
            popover: 'manual',
            id: `glossary-popup-${++glossaryPopupCount}`,
        });
        if (asDialog) {
            popup.setAttribute('role', 'dialog');
            popup.setAttribute('aria-label', entry.title || resolvedKey);
        }
        popup.addEventListener('beforetoggle', (event) => {
            if (event.newState === 'closed') this.#forgetGlossaryPopup(popup);
        });
        // On `toggle`, not `beforetoggle`: only once the popup is closed has its fade-out
        // begun for `removePopupAfterTransition` to wait on.
        popup.addEventListener('toggle', (event) => {
            if (event.newState === 'closed') removePopupAfterTransition(popup);
        });

        // Everything above `level - 1` was just closed, so the push lands at `level`.
        this.#glossaryPopupStack.push({ element: popup, termElement, key: resolvedKey });
        markExpanded(termElement, popup);

        showAnchoredPopup(
            popup,
            termElement,
            this.#glossaryPopupTemplate(glossary, entry, excludeKeys, withClose),
        );
    }

    /**
     * A glossary popup is closing. Drop it and anything still above it from the stack;
     * its `toggle` removes it once it has faded.
     * @param {HTMLDivElement} popup
     */
    #forgetGlossaryPopup(popup) {
        const level = this.#glossaryPopupStack.findIndex((entry) => entry.element === popup);
        if (level !== -1) {
            for (const entry of this.#glossaryPopupStack.splice(level)) {
                markExpanded(entry.termElement, null);
            }
        }
        if (this.#glossaryPopupStack.length === 0) this.#touchOpened = false;
        stopFollowingAnchor(popup);
    }

    /**
     * Close all popups with levels strictly greater than `level`.
     * @param {number} level - `-1` closes the whole stack.
     */
    #hideGlossaryLevelsAbove(level) {
        while (this.#glossaryPopupStack.length > level + 1) {
            const top = /** @type {{element: HTMLDivElement, termElement: Element}} */ (
                this.#glossaryPopupStack.pop()
            );
            markExpanded(top.termElement, null);
            // Its `toggle` removes it once it has faded.
            hideAnchoredPopup(top.element);
        }

        // The tap flag belongs to the stack: a mouse taking over empties the stack
        // through this method, and a flag left true would disable scroll dismissal
        // for every popup opened after it.
        if (this.#glossaryPopupStack.length === 0) {
            this.#touchOpened = false;
        }
    }

    /**
     * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary: annotates the body, names the close button.
     * @param {import('@tba3/module-base/glossary').GlossaryEntry} entry
     * @param {Set<string>} excludeKeys - Keys already open, so a popup never annotates its own ancestors.
     * @param {boolean} withClose
     * @returns {import('lit').TemplateResult}
     */
    #glossaryPopupTemplate(glossary, entry, excludeKeys, withClose) {
        // The title is text (for a payload entry, the server's level name). The body
        // is HTML: from the bundled glossary, or from the API, whose level prose
        // competenceScalePayload.js sanitizes on ingest. Its terms are no tab stops
        // until Enter moves focus in (#handleGlossaryKeyDown): each would open one more
        // popup at every Tab.
        const body = glossary.annotateHTML(entry.body || '', excludeKeys, { focusable: false });
        // A tapped popup has no cursor to move away and a tablet no Escape key.
        const closeLabel = glossary.getRequiredEntryText(
            'general.buttons.element_texts.close.label',
        );
        const close = withClose
            ? html`<button
                  type="button"
                  class="btn btn--icon ${GLOSSARY_CLOSE_CLASS}"
                  aria-label=${closeLabel}
              >
                  ${renderIcon('close')}
              </button>`
            : nothing;
        const title = html`<div class="glossary-popup-title">${entry.title || ''}</div>`;
        const prose = html`<div class="glossary-prose">${trusted(body)}</div>`;
        return html`${close}${title}${prose}`;
    }
}

export const tooltipService = new TooltipService();
