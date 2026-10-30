// @vitest-browser
/**
 * The touch paths of tooltipService: tap-to-open glossary popups, tap-to-toggle
 * icon-button labels, and the modality gate that keeps them apart from the mouse
 * paths.
 *
 * The service is a singleton, so each test initialises it against a fresh
 * `.main-content` and disposes it again.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { tooltipService } from '../../../src/common/services/tooltipService.js';
import { glossaryTermAttrs } from '@tba3/module-base/glossary';
import { createTestContext } from '../../support/glossaryFixture.js';

/** @type {import('../../../src/common/context/index.js').ModuleContext} */
let context;
import { nextAnimationFrames } from '../../support/dom.js';
import { mountMainContent } from '../../support/domShell.js';
import { required } from '../../support/required.js';

/** @type {HTMLElement} */
let main;

/** The frames a shown popup takes to settle: its placement and its fade-in. */
const SETTLE_FRAMES = 2;

/** The service's open delay for a hovered or keyboard-focused glossary term. */
const HOVER_OPEN_DELAY_MS = 500;

/**
 * Tap `el` with Chromium's touch compat sequence, including the simulated
 * `mouseover` it fires before the click, which the service has to ignore.
 *
 * `detail: 1`: a pointer-driven click carries a click count, a keyboard activation
 * carries 0, and the service tells the two apart by that.
 * @param {Element} el
 * @param {string} [pointerType]
 */
function tap(el, pointerType = 'touch') {
    el.dispatchEvent(new PointerEvent('pointerover', { pointerType, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

/**
 * Put the service into mouse modality and hover `el`.
 * @param {Element} el
 */
function hover(el) {
    el.dispatchEvent(new PointerEvent('pointerover', { pointerType: 'mouse', bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}

const popups = () => document.querySelectorAll('.glossary-popup');
const visiblePopups = () => document.querySelectorAll('.glossary-popup:popover-open');
const delegated = () => required(document.getElementById('tooltip-delegated'));

/** @type {HTMLElement} Where the pointer rests between tests, away from every term. */
let pointerPark;

beforeAll(() => {
    context = createTestContext('en');
});

beforeEach(async () => {
    main = mountMainContent();
    pointerPark = document.createElement('div');
    pointerPark.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 8px; height: 8px;';
    document.body.append(pointerPark);
    tooltipService.init(context.glossary);
    // A test that clicked a term leaves the pointer on it, and the next test's term
    // renders in the same place: Chromium's synthetic mouseover after the layout change
    // starts the real hover timer, which a slow run lets open a popup before the test
    // takes over the clock.
    await userEvent.hover(pointerPark);
});

afterEach(() => {
    tooltipService.dispose();
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

        // No timer advanced: the 500 ms hover open delay is bypassed.
        expect(popups()).toHaveLength(1);
    });

    // A closed popup stays in the DOM for its removal transition, so dismissal is
    // asserted on `:popover-open`.
    it('closes on a second tap of the same term', async () => {
        const term = mountTerm();

        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);

        tap(term);

        expect(visiblePopups()).toHaveLength(0);
    });

    it('keeps a closed popup in the DOM until its fade-out has run', async () => {
        // Removal scheduled while the popup was still open found no fade to wait on and
        // cut it off. The fade's tokens are set here, since no token sheet is loaded.
        const root = document.documentElement.style;
        root.setProperty('--motion-duration-fast', '80ms');
        root.setProperty('--motion-ease-standard', 'linear');
        try {
            const term = mountTerm();
            tap(term);
            await nextAnimationFrames(SETTLE_FRAMES);

            tap(term);
            await nextAnimationFrames(1);
            expect(visiblePopups()).toHaveLength(0);
            expect(popups()).toHaveLength(1);

            await expect.poll(() => popups().length, { timeout: 1000 }).toBe(0);
        } finally {
            root.removeProperty('--motion-duration-fast');
            root.removeProperty('--motion-ease-standard');
        }
    });

    it('closes on a click outside it', async () => {
        const term = mountTerm();
        // Above the term: the popup opens below it and would cover a target placed there.
        main.insertAdjacentHTML('afterbegin', '<p class="outside">Daneben</p>');
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);

        await userEvent.click(/** @type {HTMLElement} */ (main.querySelector('.outside')));

        expect(visiblePopups()).toHaveLength(0);
    });

    it('handles the Escape that closed a popup, and leaves one with nothing open alone', async () => {
        // A popup inside a modal closes first; the overlay only closes on an
        // Escape nothing else handled.
        const term = mountTerm();
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);

        const closing = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        document.dispatchEvent(closing);
        expect(closing.defaultPrevented).toBe(true);
        expect(visiblePopups()).toHaveLength(0);

        const idle = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        document.dispatchEvent(idle);
        expect(idle.defaultPrevented).toBe(false);
    });

    it('keeps the popup open while reading inside it', async () => {
        const term = mountTerm();
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);

        tap(required(popups()[0]?.querySelector('.glossary-prose')));

        expect(visiblePopups()).toHaveLength(1);
    });

    it('nests a term tapped inside a popup and keeps the parent open', () => {
        // `hörverstehen`'s body names Leseverstehen, so the annotator marks it up
        // as a term inside the popup it renders.
        const term = mountTerm('hörverstehen', 'Hörverstehen');
        tap(term);

        const nested = popups()[0].querySelector('[data-glossary-key]');
        expect(nested).not.toBeNull();

        tap(required(nested));

        // Nested, not replaced: the parent stays and the child is appended after it.
        expect(popups()).toHaveLength(2);
        expect(popups()[0].contains(nested)).toBe(true);
    });

    it('renders a payload-supplied title as text, never as markup', () => {
        // Payload entries carry the server's level names; a foreign `?api=` base must
        // not write HTML into a popup through them.
        context.glossary.registerPayloadEntries(
            new Map([['ger', { title: '<img src=x onerror="window.__pwned=1">', body: 'B' }]]),
        );
        const term = mountTerm();

        tap(term);

        const title = required(popups()[0]?.querySelector('.glossary-popup-title'));
        expect(title.querySelector('img')).toBeNull();
        expect(title.textContent).toBe('<img src=x onerror="window.__pwned=1">');

        // Payload entries live as long as the glossary, so the next test gets a fresh one.
        context = createTestContext('en');
        tooltipService.init(context.glossary);
    });

    it('does not open for a term inside a button', () => {
        main.innerHTML = `<button type="button"><span class="glossary-term" data-glossary-key="ger">GER</span></button>`;
        const term = /** @type {HTMLElement} */ (main.querySelector('.glossary-term'));

        tap(term);

        // The button navigates; a popup would open over a view being replaced.
        expect(popups()).toHaveLength(0);
    });

    it('still opens when the tapped element stops click propagation', () => {
        // Chart click handlers stop propagation, so the tap listener is registered in
        // the capture phase.
        const term = mountTerm();
        required(term.parentElement).addEventListener('click', (e) => e.stopPropagation());

        tap(term);

        expect(popups()).toHaveLength(1);
    });
});

describe('modality gate', () => {
    it('ignores the simulated mouse events a tap produces', async () => {
        const term = mountTerm();
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);

        // Lifting the finger emits a `mouseout` with no relatedTarget. Read as a
        // hover leaving the term, it schedules the grace hide and closes the popup
        // the tap just opened.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        term.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        vi.advanceTimersByTime(250);

        expect(visiblePopups()).toHaveLength(1);
    });

    it('still opens on hover after the 500 ms delay under a mouse', () => {
        vi.useFakeTimers();
        const term = mountTerm();

        hover(term);
        expect(popups()).toHaveLength(0);

        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 1);
        expect(popups()).toHaveLength(0);

        vi.advanceTimersByTime(1);
        expect(popups()).toHaveLength(1);
    });

    it('gives a hover-opened popup no close button', () => {
        vi.useFakeTimers();
        const term = mountTerm();

        hover(term);
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

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
        // A pen can hover like a mouse or only tap like a finger. Denying it the tap
        // path leaves a tap-only pen no route, so the gate excludes `mouse` rather
        // than requiring `touch`.
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
        // hover popup, which has no close button.
        tap(term, 'pen');
        expect(popups()).toHaveLength(1);

        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

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
        expect(delegated().matches(':popover-open')).toBe(true);

        tap(button);
        expect(delegated().matches(':popover-open')).toBe(false);

        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));

        expect(delegated().matches(':popover-open')).toBe(false);
    });

    it('still closes a tapped-open popup once the modality has flipped to mouse', async () => {
        // A trackpad taking over between the tap that rendered the close button and
        // the press that uses it. Gating the button on the modality would leave the
        // popup with no way out.
        const term = mountTerm();
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);
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
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);

        window.dispatchEvent(new Event('scroll'));
        await nextAnimationFrames(SETTLE_FRAMES);

        // It follows its term while the page moves; a tap has no cursor to lose.
        expect(visiblePopups()).toHaveLength(1);
    });

    /**
     * Hover-open a popup at a term mounted by `mountTerm`.
     * @returns {Promise<HTMLElement>} The term.
     */
    async function hoverOpen() {
        // Only the timeouts are faked: the popup's placement rides animation frames
        // that a full fake-timer swap would strand.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const term = mountTerm();
        hover(term);
        vi.advanceTimersByTime(550);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);
        return term;
    }

    it('dismisses a hover-opened popup on a scroll', async () => {
        await hoverOpen();

        window.dispatchEvent(new Event('scroll'));
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(visiblePopups()).toHaveLength(0);
    });

    // The shell scrolls inside its views and cards; their scroll events do not bubble.
    it('dismisses a hover-opened popup when the container holding its term scrolls', async () => {
        await hoverOpen();

        main.dispatchEvent(new Event('scroll'));
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(visiblePopups()).toHaveLength(0);
    });

    it('leaves a hover-opened popup standing when an unrelated container scrolls', async () => {
        await hoverOpen();
        const elsewhere = document.createElement('div');
        document.body.append(elsewhere);

        elsewhere.dispatchEvent(new Event('scroll'));
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(visiblePopups()).toHaveLength(1);
        elsewhere.remove();
    });

    it('leaves a hover-opened popup standing while it scrolls its own text', async () => {
        await hoverOpen();

        popups()[0].dispatchEvent(new Event('scroll'));
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(visiblePopups()).toHaveLength(1);
    });

    it('dismisses a tapped-open popup on a resize', async () => {
        const term = mountTerm();
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);

        // A rotation invalidates the anchor, unlike a scroll.
        window.dispatchEvent(new Event('resize'));
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(visiblePopups()).toHaveLength(0);
    });

    it('goes back to dismissing on scroll once a mouse has replaced the tapped popup', async () => {
        // The tap exemption belongs to the popup that was tapped open, not to the
        // service: on a hybrid device a hover replaces the tapped popup with one
        // that must scroll away like any other hover popup.
        main.innerHTML = `<p><span class="glossary-term" data-glossary-key="ger">GER-Stufe</span>
            <span class="glossary-term" data-glossary-key="hörverstehen">Hörverstehen</span></p>`;
        const [tapped, hovered] = /** @type {HTMLElement[]} */ ([
            ...main.querySelectorAll('.glossary-term'),
        ]);

        tap(tapped);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(1);

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        hover(hovered);
        vi.advanceTimersByTime(600);
        await nextAnimationFrames(SETTLE_FRAMES);
        // The replacement is the hover-opened one: it carries no close button.
        expect(popups()[popups().length - 1].querySelector('.glossary-popup-close')).toBeNull();

        window.dispatchEvent(new Event('scroll'));
        await nextAnimationFrames(SETTLE_FRAMES);

        expect(visiblePopups()).toHaveLength(0);
    });
});

describe('icon-button labels on touch', () => {
    /** @returns {{button: HTMLElement, clicks: number[]}} */
    function mountIconButton() {
        main.innerHTML = `<button type="button" class="btn btn--icon" data-tooltip-text="Als PDF exportieren">X</button>`;
        const button = /** @type {HTMLElement} */ (main.querySelector('button'));
        /** @type {number[]} */
        const clicks = [];
        button.addEventListener('click', () => clicks.push(1));
        return { button, clicks };
    }

    it('shows the label and still runs the button’s own click', async () => {
        const { button, clicks } = mountIconButton();

        tap(button);
        await nextAnimationFrames(SETTLE_FRAMES);

        // On touch the label is the only way to learn what an icon-only control does.
        expect(delegated().matches(':popover-open')).toBe(true);
        expect(delegated().textContent).toContain('Als PDF exportieren');
        expect(clicks).toHaveLength(1);
    });
});

describe('glossary popups on keyboard focus', () => {
    /**
     * A term between two buttons, the first focused, so one Tab lands on the term.
     * @param {string} [key]
     * @param {string} [text]
     * @returns {{term: HTMLElement, after: HTMLButtonElement}}
     */
    function mountFocusableTerm(key = 'ger', text = 'GER-Stufe') {
        main.innerHTML = `<button type="button" class="before">Davor</button><span ${glossaryTermAttrs(key)}>${text}</span><button type="button" class="after">Danach</button>`;
        /** @type {HTMLButtonElement} */ (required(main.querySelector('.before'))).focus();
        return {
            term: /** @type {HTMLElement} */ (main.querySelector('.glossary-term')),
            after: /** @type {HTMLButtonElement} */ (main.querySelector('.after')),
        };
    }

    /**
     * Focus the term from the keyboard and let focus rest on it for the 500 ms hover
     * delay, on a fake clock.
     * @param {HTMLElement} term
     * @returns {Promise<void>}
     */
    async function focusAndRest(term) {
        await userEvent.keyboard('{Shift}');
        vi.useFakeTimers();
        term.focus();
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    }

    it('opens a dialog the term points at, which Enter moves focus into', async () => {
        // The popup sits at the end of the page: without the pointers a screen reader
        // hears "expanded" and nothing else, and without the way in, its own terms are
        // pointer-only. `hörverstehen`'s body holds a term.
        const { term } = mountFocusableTerm('hörverstehen', 'Hörverstehen');
        term.focus();
        await userEvent.keyboard('{Enter}');

        const popup = /** @type {HTMLElement} */ (required(visiblePopups()[0]));
        expect(popup.getAttribute('role')).toBe('dialog');
        expect(popup.getAttribute('aria-label')).toBeTruthy();
        expect(term.getAttribute('aria-controls')).toBe(popup.id);
        expect(term.getAttribute('aria-describedby')).toBe(popup.id);

        await userEvent.keyboard('{Enter}');
        expect(visiblePopups()).toHaveLength(1);
        const nested = required(popup.querySelector('.glossary-term'));
        expect(document.activeElement).toBe(nested);
        expect(nested.getAttribute('role')).toBe('button');

        await userEvent.keyboard('{Escape}');
        expect(visiblePopups()).toHaveLength(0);
        expect(term.hasAttribute('aria-controls')).toBe(false);
    });

    it('opens once focus rests on a term, and closes when focus leaves the stack', async () => {
        // A hover is the only other way in, and a keyboard has none.
        const { term, after } = mountFocusableTerm();

        await focusAndRest(term);

        expect(visiblePopups()).toHaveLength(1);
        expect(term.getAttribute('aria-expanded')).toBe('true');

        after.focus();

        expect(visiblePopups()).toHaveLength(0);
        expect(term.getAttribute('aria-expanded')).toBe('false');
    });

    it('opens nothing when Tab moves past a term before the delay', async () => {
        // Tabbing through annotated prose must not open a popup per term.
        const { term, after } = mountFocusableTerm();
        await userEvent.keyboard('{Shift}');
        vi.useFakeTimers();

        term.focus();
        vi.advanceTimersByTime(300);
        after.focus();
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

        expect(popups()).toHaveLength(0);
    });

    it('opens at once on Enter, and closes on Space', async () => {
        // The term is a role="button": it answers the button keys.
        // On a fake clock: a key press slower than the 500 ms focus delay would let the
        // delay open the popup first, and Enter would then close it. `userEvent` waits on
        // the page clock, so that Enter is dispatched; it cancels the delay, and the rest
        // runs on the real clock.
        const { term } = mountFocusableTerm();
        await userEvent.keyboard('{Shift}');
        vi.useFakeTimers();
        term.focus();

        term.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
        expect(visiblePopups()).toHaveLength(1);
        vi.useRealTimers();

        // A second Enter would move focus into the popup.
        await userEvent.keyboard(' ');
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(0);
        expect(document.activeElement).toBe(term);
    });

    it('lets Tab pass the popup by: its terms are stops only once Enter went in', async () => {
        // `hörverstehen`'s body names Leseverstehen, so its popup holds a term. The
        // popup follows its term in the focus order, so a stop there would be the next
        // Tab's, and each Tab would open one more popup; Enter is the way in.
        const { term, after } = mountFocusableTerm('hörverstehen', 'Hörverstehen');
        await focusAndRest(term);
        vi.useRealTimers();

        const nested = required(popups()[0]?.querySelector('[data-glossary-key]'));
        expect(nested.hasAttribute('tabindex')).toBe(false);

        await userEvent.tab();
        expect(document.activeElement).toBe(after);
        await nextAnimationFrames(SETTLE_FRAMES);
        expect(visiblePopups()).toHaveLength(0);
    });

    it('returns focus to the page term when Escape closes a popup holding it', async () => {
        // Without it focus falls to <body> and the reader starts over at the top.
        const { term } = mountFocusableTerm();
        tap(term);
        await nextAnimationFrames(SETTLE_FRAMES);
        const close = /** @type {HTMLElement} */ (
            required(popups()[0]?.querySelector('.glossary-popup-close'))
        );
        close.focus();
        vi.useFakeTimers();

        await userEvent.keyboard('{Escape}');
        // Focus resting on the term again must not reopen what Escape closed.
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

        expect(visiblePopups()).toHaveLength(0);
        expect(document.activeElement).toBe(term);
    });

    it('leaves a term a click focused to the hover path', async () => {
        // A term is a tab stop, so a click focuses it; opening on that focus would
        // pop every clicked term at once, past the hover delay.
        const { term } = mountFocusableTerm();
        // Counted as they open: a popup opened on the click's focus is light-dismissed by
        // the same click's pointerup, gone before any assertion could see it.
        let opened = 0;
        /** @param {Event} event - A popover's `beforetoggle`, which does not bubble. */
        const count = (event) => {
            if (/** @type {ToggleEvent} */ (event).newState === 'open') opened++;
        };
        document.addEventListener('beforetoggle', count, { capture: true });

        await userEvent.click(term);
        document.removeEventListener('beforetoggle', count, { capture: true });

        expect(document.activeElement).toBe(term);
        expect(opened).toBe(0);
    });

    it('stays open when focus leaves the term for nothing', async () => {
        // A tap on a popup's plain text after a tap on its term blurs the term to
        // no element; reading inside an open popup must not dismiss it.
        const { term } = mountFocusableTerm();
        await focusAndRest(term);
        expect(visiblePopups()).toHaveLength(1);

        term.blur();

        expect(visiblePopups()).toHaveLength(1);
    });
});

describe('icon-button labels on keyboard focus', () => {
    it('shows the label while the button holds keyboard focus', async () => {
        // An icon-only control has no other visible name.
        main.innerHTML = `<button type="button" class="before">Davor</button><button type="button" class="icon" data-tooltip-text="Als PDF exportieren">X</button><button type="button" class="after">Danach</button>`;
        /** @type {HTMLButtonElement} */ (required(main.querySelector('.before'))).focus();

        await userEvent.tab();
        expect(delegated().matches(':popover-open')).toBe(true);
        expect(delegated().textContent).toContain('Als PDF exportieren');

        await userEvent.tab();
        expect(delegated().matches(':popover-open')).toBe(false);
    });

    it('hides the label on Escape and claims the press', async () => {
        // The surface the button sits in (a dialog) stays open: the label is dismissed
        // without moving focus.
        main.innerHTML = `<button type="button" class="before">Davor</button><button type="button" class="icon" data-tooltip-text="Als PDF exportieren">X</button>`;
        /** @type {HTMLButtonElement} */ (required(main.querySelector('.before'))).focus();
        await userEvent.tab();
        expect(delegated().matches(':popover-open')).toBe(true);

        const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        document.dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(true);
        expect(delegated().matches(':popover-open')).toBe(false);
    });

    it('opens no label on the focus a closing menu hands back to its trigger', async () => {
        main.innerHTML = `<button type="button" class="before">Davor</button><button type="button" class="icon" data-tooltip-text="Exportieren">X</button><div popover="auto"><button type="button" class="item">PDF</button></div>`;
        const before = /** @type {HTMLButtonElement} */ (required(main.querySelector('.before')));
        const trigger = /** @type {HTMLButtonElement} */ (required(main.querySelector('.icon')));
        const menu = /** @type {HTMLElement} */ (required(main.querySelector('[popover]')));
        before.focus();
        await userEvent.keyboard('{Shift}');
        menu.showPopover();
        /** @type {HTMLButtonElement} */ (required(menu.querySelector('.item'))).focus();

        trigger.focus();
        menu.hidePopover();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delegated().matches(':popover-open')).toBe(false);

        // The same focus from the page opens it.
        before.focus();
        trigger.focus();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delegated().matches(':popover-open')).toBe(true);
    });
});

describe('tooltips as descriptions', () => {
    // Why a choice is unavailable lives only in its tooltip; assistive tech reads the
    // description the moment the control is focused, before any label shows.
    it('describes a focused control by a tooltip that says more than its name', () => {
        main.innerHTML = `<button type="button" class="reason" aria-disabled="true" data-tooltip-text="Im Prototyp nicht befüllt.">Gesamt</button><button type="button" class="same" data-tooltip-text="Exportieren">Exportieren</button>`;
        const reason = /** @type {HTMLButtonElement} */ (required(main.querySelector('.reason')));
        const same = /** @type {HTMLButtonElement} */ (required(main.querySelector('.same')));

        reason.focus();
        expect(reason.getAttribute('aria-description')).toBe('Im Prototyp nicht befüllt.');

        same.focus();
        expect(same.hasAttribute('aria-description')).toBe(false);
    });

    it('follows a tooltip that changed with the control', () => {
        main.innerHTML = `<button type="button" aria-label="Vormerken" data-tooltip-text="Vormerken">X</button>`;
        const button = /** @type {HTMLButtonElement} */ (required(main.querySelector('button')));
        button.focus();
        expect(button.hasAttribute('aria-description')).toBe(false);

        button.blur();
        button.setAttribute('data-tooltip-text', 'Aus dem Bericht entfernen');
        button.focus();
        expect(button.getAttribute('aria-description')).toBe('Aus dem Bericht entfernen');
    });
});

describe('glossary popups from a control that carries a term', () => {
    /**
     * A legend-pill-like toggle whose label holds a term, between two buttons, with the
     * keyboard the last input — so a programmatic focus is `:focus-visible`.
     * @returns {Promise<{control: HTMLButtonElement, term: HTMLElement, after: HTMLButtonElement}>}
     */
    async function mountControl() {
        main.innerHTML = `<button type="button" class="before">Davor</button><button type="button" class="control" data-glossary-focus>L = <span class="glossary-term" data-glossary-key="ger">GER-Stufe</span></button><button type="button" class="after">Danach</button>`;
        /** @type {HTMLButtonElement} */ (required(main.querySelector('.before'))).focus();
        await userEvent.keyboard('{Shift}');
        return {
            control: /** @type {HTMLButtonElement} */ (main.querySelector('.control')),
            term: /** @type {HTMLElement} */ (main.querySelector('.glossary-term')),
            after: /** @type {HTMLButtonElement} */ (main.querySelector('.after')),
        };
    }

    it('opens the term inside once keyboard focus rests on the control for the hover delay', async () => {
        // The term cannot be a tab stop inside a button, and opening at once would
        // pop a popup over the next pills at every Tab through a legend.
        const { control } = await mountControl();
        vi.useFakeTimers();

        control.focus();
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 1);
        expect(popups()).toHaveLength(0);

        vi.advanceTimersByTime(1);
        expect(visiblePopups()).toHaveLength(1);
        // The popup is the term's entry: the key comes from the term inside the control.
        const entry = required(
            context.glossary.getEntry(required(context.glossary.resolveEntryKey('ger'))),
        );
        expect(popups()[0].querySelector('.glossary-popup-title')?.textContent).toBe(entry.title);
    });

    it('opens nothing when focus moves on before the delay', async () => {
        const { control, after } = await mountControl();
        vi.useFakeTimers();

        control.focus();
        vi.advanceTimersByTime(300);
        after.focus();
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

        expect(popups()).toHaveLength(0);
    });

    it('closes the popup when focus leaves the control', async () => {
        const { control, after } = await mountControl();
        vi.useFakeTimers();
        control.focus();
        vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
        expect(visiblePopups()).toHaveLength(1);

        after.focus();

        expect(visiblePopups()).toHaveLength(0);
    });
});

describe('a rich label moving between triggers', () => {
    /**
     * Two rich triggers: A inside an open menu, B on the page. The pointer has crossed
     * from A to B inside the hover grace, so the open label moved without closing.
     * @returns {Promise<{menu: HTMLElement, b: HTMLElement}>}
     */
    async function moveFromMenuToPage() {
        main.innerHTML = `<div popover="auto"><span class="a" data-tooltip-html="A">A</span></div><span class="b" data-tooltip-html="B">B</span>`;
        const menu = /** @type {HTMLElement} */ (required(main.querySelector('[popover]')));
        const a = /** @type {HTMLElement} */ (required(main.querySelector('.a')));
        const b = /** @type {HTMLElement} */ (required(main.querySelector('.b')));
        menu.showPopover();
        hover(a);
        await nextAnimationFrames(SETTLE_FRAMES);
        a.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: b }));
        hover(b);
        return { menu, b };
    }

    it('shows itself anew for the new trigger, so it no longer belongs to the old one', async () => {
        // A popover keeps the invoker it was shown with: moved while open, the label
        // stayed nested under A's menu and closed with it.
        const { menu, b } = await moveFromMenuToPage();
        await nextAnimationFrames(1);

        expect(delegated().matches(':popover-open')).toBe(true);
        expect(delegated().getAnimations()).toHaveLength(0);
        menu.hidePopover();
        expect(delegated().matches(':popover-open')).toBe(true);

        // It still watches its new trigger: removing B takes the label down.
        b.remove();
        await Promise.resolve();
        expect(delegated().matches(':popover-open')).toBe(false);
    });

    it('closes after the grace once the pointer leaves the new trigger', async () => {
        const { b } = await moveFromMenuToPage();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

        b.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: pointerPark }));
        vi.advanceTimersByTime(150);

        expect(delegated().matches(':popover-open')).toBe(false);
    });
});
