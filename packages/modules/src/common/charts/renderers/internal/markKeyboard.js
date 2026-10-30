/**
 * The keyboard model of a chart's marks: a roving tab stop (WAI-ARIA APG). The chart is
 * one stop in the page's tab order, and the arrow keys walk its focusable marks in DOM
 * order, the order the chart draws them in. Exactly one mark has `tabindex="0"`; the
 * rest have `-1`. A glossary term in the chart's text is a tab stop of its own, outside
 * the walk.
 */

import { isMarkShown } from './chartInteractionUtils.js';

/** A chart mark the arrow keys walk: focusable, and not a glossary term in its text. */
const MARK_SELECTOR = '[tabindex]:not(.glossary-term)';

/** @type {{[key: string]: 1|-1}} The keys that move focus, and which way each walks the marks. */
const KEY_STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 1, End: -1 };

/**
 * The first shown mark stepping from `from` (exclusive) in direction `step`.
 * @param {Element[]} marks - The focusable marks, in DOM order.
 * @param {number} from - The index to step away from; -1 or `marks.length` to start at an end.
 * @param {1|-1} step
 * @returns {Element|undefined} None past the end.
 */
function firstShown(marks, from, step) {
    for (let i = from + step; i >= 0 && i < marks.length; i += step) {
        if (isMarkShown(marks[i])) return marks[i];
    }
    return undefined;
}

export class MarkKeyboard {
    /** @type {() => SVGSVGElement|null} */
    #svg;
    /** @type {() => boolean} */
    #claimsTabStop;
    /** Whether a tab-stop sync waits for the end of the task. */
    #syncQueued = false;

    /**
     * @param {() => SVGSVGElement|null} svg - Reads the chart's SVG root, which a pass may replace.
     * @param {() => boolean} claimsTabStop - Whether a mark is the chart's tab stop; false
     *     for a chart whose group owns the one stop: its marks are all `-1`, reached by script.
     */
    constructor(svg, claimsTabStop) {
        this.#svg = svg;
        this.#claimsTabStop = claimsTabStop;
    }

    /** @type {(event: KeyboardEvent) => void} */
    #onKeydown = (event) => this.#moveFocus(event);

    /** @type {(event: FocusEvent) => void} */
    #onFocusin = (event) => this.#skipHiddenMark(event);

    /**
     * Walk the marks with the arrow keys, and pass focus on from a mark hidden since it
     * took the tab stop. Bound on the HTML container the SVG roots are drawn into, by
     * the renderer's `create()`: a focus listener on an `<svg>` makes Chrome put the
     * root itself in the tab order, a nameless stop with the UA ring.
     * @param {import('d3').Selection<HTMLElement, unknown, null, undefined>} container
     */
    wire(container) {
        container.on('keydown.roving', this.#onKeydown).on('focusin.roving', this.#onFocusin);
    }

    /**
     * Take the listeners `wire` bound off the container, when they are still this
     * model's: a renderer wired on the same container since keeps its own.
     * @param {import('d3').Selection<HTMLElement, unknown, null, undefined>} container
     */
    unwire(container) {
        if (container.on('keydown.roving') !== this.#onKeydown) return;
        container.on('keydown.roving', null).on('focusin.roving', null);
    }

    /**
     * @param {Event} event - A key or focus event in the container.
     * @returns {Element|null} The mark it came from, or null for anything outside the SVG's walk.
     */
    #markOf(event) {
        const target = /** @type {Element} */ (event.target);
        return target.matches(MARK_SELECTOR) && this.#svg()?.contains(target) ? target : null;
    }

    /**
     * Sync the tab stop once, in a microtask, however often a task asks: each sync
     * scans every mark, and visibility may be toggled bar by bar. The microtask still
     * runs before paint, input or an axe scan sees the hidden marks.
     */
    queueSync() {
        if (this.#syncQueued) return;
        this.#syncQueued = true;
        queueMicrotask(() => {
            this.#syncQueued = false;
            this.#sync();
        });
    }

    /**
     * The focusable marks that are shown, in DOM order.
     * @returns {Element[]}
     */
    #shownMarks() {
        const svg = this.#svg();
        return svg ? [...svg.querySelectorAll(MARK_SELECTOR)].filter(isMarkShown) : [];
    }

    /**
     * Give the chart its tab stop once a mark is focusable: the mark that holds it while
     * that one is shown, else the first shown mark. A hidden mark never keeps it: it is
     * `aria-hidden`, and a tab stop there fails axe `aria-hidden-focus`. The SVG turns
     * `group` once anything in it is focusable, a glossary term too: an `img` hides its
     * children from assistive tech.
     */
    #sync() {
        const svg = this.#svg();
        if (!svg?.querySelector('[tabindex]')) return;
        svg.setAttribute('role', 'group');
        const marks = [...svg.querySelectorAll(MARK_SELECTOR)];
        if (!marks.length) return;
        const current = marks.find((mark) => mark.getAttribute('tabindex') === '0');
        if (!this.#claimsTabStop()) {
            current?.setAttribute('tabindex', '-1');
            return;
        }
        if (current && isMarkShown(current)) return;
        current?.setAttribute('tabindex', '-1');
        marks.find(isMarkShown)?.setAttribute('tabindex', '0');
    }

    /**
     * Where the keyboard enters the chart from outside it, for an owner that holds the
     * tab stop (`tabStop: false`): its first shown mark.
     * @returns {Element|null}
     */
    firstShownMark() {
        return this.#shownMarks()[0] ?? null;
    }

    /**
     * Hand the tab stop and focus to another mark.
     * @param {Element} from - The mark that has them.
     * @param {Element|undefined} to - The mark that takes them.
     */
    #focusMark(from, to) {
        if (!to || to === from) return;
        from.setAttribute('tabindex', '-1');
        to.setAttribute('tabindex', this.#claimsTabStop() ? '0' : '-1');
        /** @type {SVGElement} */ (to).focus();
    }

    /**
     * Arrow keys move to the next or previous shown mark, Home and End to the first and
     * last; each stops at the ends.
     * @param {KeyboardEvent} event - A keydown in the container.
     */
    #moveFocus(event) {
        const mark = this.#markOf(event);
        if (!mark) return;
        const step = KEY_STEPS[event.key];
        if (step === undefined) return;
        // The arrows would scroll the page.
        event.preventDefault();
        const svg = this.#svg();
        const marks = svg ? [...svg.querySelectorAll(MARK_SELECTOR)] : [];
        /** @type {Element|undefined} */
        let target;
        if (event.key === 'Home') target = firstShown(marks, -1, 1);
        else if (event.key === 'End') target = firstShown(marks, marks.length, -1);
        // A mark hidden since it took focus sends every arrow to the first shown mark.
        else if (!isMarkShown(mark)) target = firstShown(marks, -1, 1);
        else target = firstShown(marks, marks.indexOf(mark), step);
        this.#focusMark(mark, target);
    }

    /**
     * A mark hidden since it took the tab stop (a legend toggle) passes focus on to the
     * next shown mark, or the last one.
     * @param {FocusEvent} event - A focusin in the container.
     */
    #skipHiddenMark(event) {
        const mark = this.#markOf(event);
        if (!mark || isMarkShown(mark)) return;
        const svg = /** @type {SVGSVGElement} */ (this.#svg());
        const all = [...svg.querySelectorAll(MARK_SELECTOR)];
        const after = all.slice(all.indexOf(mark) + 1).find(isMarkShown);
        this.#focusMark(mark, after ?? this.#shownMarks().at(-1));
    }
}
