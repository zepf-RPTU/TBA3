// @vitest-browser
/**
 * The touch paths of tooltipService: tap-to-open glossary popups, tap-to-toggle
 * icon-button labels, and the modality gate that keeps them apart from the mouse
 * paths.
 *
 * Runs in real Chromium (no jsdom in this repo), so `PointerEvent` and
 * `pointerType` are the real thing rather than a defineProperty stand-in — which
 * matters, because the whole design keys off the last `pointerType` seen.
 *
 * The service is a singleton whose body listeners install once and are never
 * removed, and the browser page is per *file*: `mountMainContent()` runs once in
 * `beforeAll` (calling it per test would detach the delegated tooltip element
 * while the service still believed it was mounted), and each test resets only the
 * markup inside `.main-content` plus the popup stack.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import { tooltipService } from '@tba3/modules/common/services/tooltipService.js';
import { glossaryAnnotator } from '@tba3/modules/common/glossary/glossaryAnnotator.js';
import { initGlossaryForTests } from '../../support/glossaryFixture.js';
import { mountMainContent } from '../../support/domShell.js';

/** @type {HTMLElement} */
let main;

/** Let the deferred-visibility rAF in showAnchoredPopup run. */
const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Tap `el` with Chromium's real touch compat sequence — including the simulated
 * `mouseover` it fires *before* the click. Emitting the click alone would be a
 * friendlier world than the one the code has to survive.
 *
 * `detail: 1` is part of that fidelity, not decoration: a pointer-driven click
 * carries a click count, a keyboard activation carries 0, and the service tells
 * the two apart by exactly that.
 */
function tap(el, pointerType = 'touch') {
    el.dispatchEvent(new PointerEvent('pointerover', { pointerType, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

/** Put the service into mouse modality and hover `el`. */
function hover(el) {
    el.dispatchEvent(new PointerEvent('pointerover', { pointerType: 'mouse', bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}

const popups = () => document.querySelectorAll('.glossary-popup');
const visiblePopups = () => document.querySelectorAll('.glossary-popup.visible');
const delegated = () => document.getElementById('tooltip-delegated');

beforeAll(() => {
    mountMainContent();
    main = /** @type {HTMLElement} */ (document.querySelector('.main-content'));
    initGlossaryForTests('en');
    tooltipService.setupDelegatedTooltips();
    tooltipService.initGlossaryPopups();
});

beforeEach(() => {
    main.innerHTML = '';
    tooltipService.hideGlossaryPopups();
    // Hiding unwinds the stack but leaves the popup elements to their removal
    // timers. Popups are appended to body, which is never reset here — clear
    // them by hand so a test starts from an empty page.
    document.querySelectorAll('.glossary-popup').forEach((popup) => popup.remove());
    // Back to the default modality; each test declares its own.
    document.body.dispatchEvent(
        new PointerEvent('pointerover', { pointerType: 'mouse', bubbles: true }),
    );
});

afterEach(() => {
    vi.useRealTimers();
});

/** @returns {HTMLElement} A page-level glossary term for `key`. */
function mountTerm(key = 'ger', text = 'GER-Stufe') {
    main.innerHTML = `<p><span class="glossary-term" data-glossary-key="${key}">${text}</span></p>`;
    return /** @type {HTMLElement} */ (main.querySelector('.glossary-term'));
}

describe('glossary popups on touch', () => {
    it('opens on the first tap, with no hover delay to wait out', () => {
        const term = mountTerm();

        tap(term);

        // Asserted without advancing a single timer: that is the proof the
        // 500 ms GLOSSARY_HOVER_OPEN_DELAY path was bypassed rather than merely
        // being fast.
        expect(popups()).toHaveLength(1);
        expect(popups()[0].getAttribute('data-glossary-level')).toBe('0');
    });

    // A closed popup lingers in the DOM for the 150 ms removal transition, so
    // dismissal is asserted on `.visible` — which is also what the user sees.
    it('closes on a second tap of the same term', async () => {
        const term = mountTerm();

        tap(term);
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        tap(term);

        expect(visiblePopups()).toHaveLength(0);
    });

    it('closes on a tap outside everything', async () => {
        const term = mountTerm();
        tap(term);
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        tap(main);

        expect(visiblePopups()).toHaveLength(0);
    });

    it('keeps the popup open while reading inside it', async () => {
        const term = mountTerm();
        tap(term);
        await nextFrame();

        tap(popups()[0].querySelector('.glossary-popup-body'));

        expect(visiblePopups()).toHaveLength(1);
    });

    it('nests a term tapped inside a popup and keeps the parent open', () => {
        // `hörverstehen`'s body names Leseverstehen, so the annotator marks it up
        // as a term inside the popup it renders.
        const term = mountTerm('hörverstehen', 'Hörverstehen');
        tap(term);

        const nested = popups()[0].querySelector('[data-glossary-key]');
        expect(nested).not.toBeNull();

        tap(nested);

        expect(popups()).toHaveLength(2);
        expect([...popups()].map((p) => p.getAttribute('data-glossary-level'))).toEqual(['0', '1']);
    });

    it('renders a close button that dismisses the popup', async () => {
        const term = mountTerm();
        tap(term);
        await nextFrame();

        const close = popups()[0].querySelector('.glossary-popup-close');
        expect(close).not.toBeNull();
        expect(close.getAttribute('aria-label')).toBe('Schließen');

        tap(close);

        expect(visiblePopups()).toHaveLength(0);
    });

    it('renders a payload-supplied title as text, never as markup', () => {
        // Payload entries carry the server's level names; a `?api=` base that is not
        // the page's own must never get to write HTML into a popup through them.
        glossaryAnnotator.registerPayloadEntries(
            new Map([['ger', { title: '<img src=x onerror="window.__pwned=1">', body: 'B' }]]),
        );
        const term = mountTerm();

        tap(term);

        const title = popups()[0].querySelector('.glossary-popup-title');
        expect(title.querySelector('img')).toBeNull();
        expect(title.textContent).toBe('<img src=x onerror="window.__pwned=1">');

        // Payload entries live until the annotator is destroyed; do not leak them.
        initGlossaryForTests('en');
    });

    it('does not open for a term inside a button', () => {
        main.innerHTML = `<button type="button"><span class="glossary-term" data-glossary-key="ger">GER</span></button>`;
        const term = /** @type {HTMLElement} */ (main.querySelector('.glossary-term'));

        tap(term);

        // The button is a navigation verb; a popup over a view being replaced
        // helps nobody.
        expect(popups()).toHaveLength(0);
    });

    it('still opens when the tapped element stops click propagation', () => {
        // Chart click handlers do exactly this, which is why the tap listener is
        // registered in the capture phase.
        const term = mountTerm();
        term.parentElement.addEventListener('click', (e) => e.stopPropagation());

        tap(term);

        expect(popups()).toHaveLength(1);
    });
});

describe('modality gate', () => {
    it('ignores the simulated mouse events a tap produces', async () => {
        const term = mountTerm();
        tap(term);
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        // Lifting the finger emits a `mouseout` with no relatedTarget. Read as a
        // hover leaving the term, that schedules the 150 ms grace hide and closes
        // the popup the tap just opened — which is exactly the "opens, then
        // vanishes on its own" behaviour on a tablet today.
        term.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(visiblePopups()).toHaveLength(1);
    });

    it('still opens on hover after the 500 ms delay under a mouse', () => {
        vi.useFakeTimers();
        const term = mountTerm();

        hover(term);
        expect(popups()).toHaveLength(0);

        vi.advanceTimersByTime(499);
        expect(popups()).toHaveLength(0);

        vi.advanceTimersByTime(1);
        expect(popups()).toHaveLength(1);
    });

    it('gives a hover-opened popup no close button', () => {
        vi.useFakeTimers();
        const term = mountTerm();

        hover(term);
        vi.advanceTimersByTime(500);

        expect(popups()[0].querySelector('.glossary-popup-close')).toBeNull();
    });

    it('does nothing on a mouse click', () => {
        const term = mountTerm();

        term.dispatchEvent(
            new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }),
        );
        term.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(popups()).toHaveLength(0);
    });

    it('opens on a pen tap, which is neither mouse nor touch', () => {
        // A pen is the one pointer that falls between the two paths: it can hover
        // like a mouse (a Surface pen) or only tap like a finger (an Apple
        // Pencil). Denying it the tap path leaves the second device no route at
        // all, so the gate excludes `mouse` rather than requiring `touch`.
        const term = mountTerm();

        tap(term, 'pen');

        expect(popups()).toHaveLength(1);
        expect(popups()[0].querySelector('.glossary-popup-close')).not.toBeNull();
    });

    it('does not let a pen tap leave a hover timer that replaces its own popup', () => {
        vi.useFakeTimers();
        const term = mountTerm();

        // The compat `mouseover` a pen tap fires reaches the hover path, which
        // arms the 500 ms open delay. Left running it re-opens the same term as a
        // hover popup — one with no close button, on a device that may have no
        // other way to dismiss it.
        tap(term, 'pen');
        expect(popups()).toHaveLength(1);

        vi.advanceTimersByTime(500);

        expect(popups()).toHaveLength(1);
        expect(popups()[0].querySelector('.glossary-popup-close')).not.toBeNull();
    });

    it('ignores a keyboard activation that inherits the last tap’s modality', () => {
        // #lastPointerType is never reset, so after a tap it still reads `touch`
        // when Enter fires a click on a focused button. A keyboard click carries
        // no click count; a real tap carries 1.
        main.innerHTML = `<button type="button" data-tooltip-text="Exportieren">E</button>`;
        const button = /** @type {HTMLElement} */ (main.querySelector('button'));
        tap(button);
        expect(delegated().classList.contains('visible')).toBe(true);

        tap(button);
        expect(delegated().classList.contains('visible')).toBe(false);

        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));

        expect(delegated().classList.contains('visible')).toBe(false);
    });

    it('still closes a tapped-open popup once the modality has flipped to mouse', async () => {
        // A tablet's trackpad waking up between the tap that rendered the close
        // button and the press that uses it. The button exists only on this path,
        // so gating it on the modality would leave the popup with no way out.
        const term = mountTerm();
        tap(term);
        await nextFrame();
        const close = /** @type {HTMLElement} */ (
            popups()[0].querySelector('.glossary-popup-close')
        );
        expect(close).not.toBeNull();

        close.dispatchEvent(
            new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }),
        );
        close.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(visiblePopups()).toHaveLength(0);
    });
});

describe('scroll and resize', () => {
    it('leaves a tapped-open popup standing through a scroll', async () => {
        const term = mountTerm();
        tap(term);
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        window.dispatchEvent(new Event('scroll'));
        await nextFrame();

        // It is positioned in page coordinates, so it scrolls with its term —
        // and a tap has no cursor to lose.
        expect(visiblePopups()).toHaveLength(1);
    });

    it('dismisses a hover-opened popup on a scroll', async () => {
        // Real timers here: the popup's reveal rides a requestAnimationFrame that
        // a fake-timer swap would strand, and `.visible` is the state under test.
        const term = mountTerm();
        hover(term);
        await new Promise((resolve) => setTimeout(resolve, 550));
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        window.dispatchEvent(new Event('scroll'));
        await nextFrame();

        expect(visiblePopups()).toHaveLength(0);
    });

    it('dismisses a tapped-open popup on a resize', async () => {
        const term = mountTerm();
        tap(term);
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        // A rotation invalidates the anchor outright, unlike a scroll.
        window.dispatchEvent(new Event('resize'));
        await nextFrame();

        expect(visiblePopups()).toHaveLength(0);
    });

    it('goes back to dismissing on scroll once a mouse has replaced the tapped popup', async () => {
        // The tap exemption belongs to the popup that was tapped open, not to the
        // service: on a hybrid device the mouse takes over, its hover replaces the
        // tapped popup with one that has no cursor exemption to claim, and that one
        // must scroll away like any other.
        main.innerHTML = `<p><span class="glossary-term" data-glossary-key="ger">GER-Stufe</span>
            <span class="glossary-term" data-glossary-key="hörverstehen">Hörverstehen</span></p>`;
        const [tapped, hovered] = /** @type {HTMLElement[]} */ ([
            ...main.querySelectorAll('.glossary-term'),
        ]);

        tap(tapped);
        await nextFrame();
        expect(visiblePopups()).toHaveLength(1);

        hover(hovered);
        await new Promise((resolve) => setTimeout(resolve, 600));
        await nextFrame();
        // The replacement really is the hover-opened one: it carries no close button.
        expect(popups()[popups().length - 1].querySelector('.glossary-popup-close')).toBeNull();

        window.dispatchEvent(new Event('scroll'));
        await nextFrame();

        expect(visiblePopups()).toHaveLength(0);
    });
});

describe('icon-button labels on touch', () => {
    /** @returns {{button: HTMLElement, clicks: number[]}} */
    function mountIconButton() {
        main.innerHTML = `<button type="button" class="btn btn--icon" data-tooltip-text="Als PDF exportieren">X</button>`;
        const button = /** @type {HTMLElement} */ (main.querySelector('button'));
        const clicks = [];
        button.addEventListener('click', () => clicks.push(1));
        return { button, clicks };
    }

    it('shows the label and still runs the button’s own click', async () => {
        const { button, clicks } = mountIconButton();

        tap(button);
        await nextFrame();

        // The label *is* the button's name — on touch there is no other way to
        // learn what an icon-only control does.
        expect(delegated().classList.contains('visible')).toBe(true);
        expect(delegated().textContent).toContain('Als PDF exportieren');
        expect(clicks).toHaveLength(1);
    });

    it('hides the label on a second tap', async () => {
        const { button } = mountIconButton();

        tap(button);
        await nextFrame();
        expect(delegated().classList.contains('visible')).toBe(true);

        tap(button);

        expect(delegated().classList.contains('visible')).toBe(false);
    });

    it('takes the label away with a control whose own click closes its surface', async () => {
        // A modal's "Abbrechen", a drawer's close button: the tap shows the label
        // in the capture phase, then the control's own click hides the surface it
        // sits on — by a class, so the trigger stays connected and the
        // disconnect watcher never fires. The label must not outlive it.
        main.innerHTML = `<div class="probe-surface"><button type="button" class="btn btn--icon" data-tooltip-text="Abbrechen">X</button></div>`;
        const surface = /** @type {HTMLElement} */ (main.querySelector('.probe-surface'));
        const button = /** @type {HTMLElement} */ (main.querySelector('button'));
        button.addEventListener('click', () => {
            surface.style.visibility = 'hidden';
            surface.style.opacity = '0';
        });

        tap(button);
        expect(delegated().classList.contains('visible')).toBe(true);

        await nextFrame();

        expect(delegated().classList.contains('visible')).toBe(false);
    });
});
