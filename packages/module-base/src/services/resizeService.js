/**
 * ResizeService — one shared ResizeObserver for every owner.
 *
 * `observe()` returns the function that releases that one observation; owners hand it
 * to their ResourceTracker (`this.resources.trackSubscription(resizeService.observe(...))`),
 * so each observation lives as long as its owner and no owner can release another's.
 */

/**
 * What an observation runs on resize: a plain callback, or a read/write pair. Every
 * `measure` due in one flush runs before any `draw`, and a `draw` runs only where its
 * `measure` returned true, so N observers resized together force one layout, not N.
 * A plain callback runs in the draw phase.
 * @typedef {(() => unknown) | {measure: () => boolean, draw: () => unknown}} ResizeHandler
 */

/** @typedef {{handler: ResizeHandler, debounceMs: number, busy: boolean, dueAt: number|null}} Observation */

class ResizeService {
    /** @type {ResizeObserver|null} Created on the first observation, never before. */
    #observer = null;

    /** @type {Map<Element, Observation>} */
    #observations = new Map();

    /** @type {number|null} The one timer that flushes every observation due. */
    #timerId = null;

    /**
     * The shared ResizeObserver, built on first use: the singleton is created at import
     * time and `ResizeObserver` is a browser global, so constructing it eagerly would
     * make the package unimportable without a DOM.
     * @returns {ResizeObserver}
     */
    #resolveObserver() {
        if (this.#observer) return this.#observer;
        this.#observer = new ResizeObserver((entries) => {
            // One clock reading per batch: observers resized together come due together.
            const now = performance.now();
            for (const entry of entries) {
                const observation = this.#observations.get(entry.target);
                if (!observation) continue;
                if (observation.dueAt === null && observation.busy) {
                    entry.target.setAttribute('aria-busy', 'true');
                }
                observation.dueAt = now + observation.debounceMs;
            }
            this.#schedule();
        });
        return this.#observer;
    }

    /** Point the one timer at the earliest observation due, or clear it when none is. */
    #schedule() {
        let next = Infinity;
        for (const observation of this.#observations.values()) {
            if (observation.dueAt !== null) next = Math.min(next, observation.dueAt);
        }
        if (this.#timerId !== null) clearTimeout(this.#timerId);
        this.#timerId = null;
        if (next === Infinity) return;
        this.#timerId = window.setTimeout(
            () => this.#flush(),
            Math.max(0, next - performance.now()),
        );
    }

    /** Run every observation due: all measures, then the draws they asked for. */
    #flush() {
        this.#timerId = null;
        const now = performance.now();
        /** @type {Array<[Element, Observation]>} */
        const due = [];
        for (const [element, observation] of this.#observations) {
            // A timer can fire a hair before the clock it was set from says it should.
            if (observation.dueAt !== null && observation.dueAt <= now + 1) {
                observation.dueAt = null;
                due.push([element, observation]);
            }
        }
        const drawing = due.map(([, observation]) => {
            const { handler } = observation;
            if (typeof handler === 'function') return handler;
            try {
                // Called on the handler, like its measure: a draw written as a method
                // keeps its `this`.
                return handler.measure() ? () => handler.draw() : null;
            } catch (error) {
                console.error('[ResizeService] Callback error:', error);
                return null;
            }
        });
        due.forEach(([element, observation], index) => {
            // A measure or an earlier draw of this flush may have released it.
            const live = this.#observations.get(element) === observation;
            void this.#draw(element, observation, live ? drawing[index] : null);
        });
        this.#schedule();
    }

    /**
     * Run one observation's draw and clear its busy mark once it has finished.
     * @param {Element} element
     * @param {Observation} observation
     * @param {(() => unknown)|null} draw - What to run; null when its measure found nothing to draw.
     */
    async #draw(element, observation, draw) {
        try {
            // A draw may be async. Awaiting keeps a failed
            // resize redraw inside this catch; otherwise the rejection escapes to
            // `unhandledrejection` and is reported as a page failure.
            await draw?.();
        } catch (error) {
            console.error('[ResizeService] Callback error:', error);
        } finally {
            // A resize during the draw scheduled the next one, for this observation or
            // one that replaced it: still busy.
            const current = this.#observations.get(element) ?? observation;
            if (observation.busy && current.dueAt === null) element.removeAttribute('aria-busy');
        }
    }

    /**
     * Observe an element for resize events. A second observation of the same element
     * replaces the first.
     * @param {Element} element
     * @param {ResizeHandler} handler - Run, debounced, on resize
     * @param {object} [options]
     * @param {number} [options.debounceMs=100]
     * @param {boolean} [options.busy=false] - Mark the element `aria-busy` from a resize
     *     until its draw has finished: what it shows is about to be redrawn.
     * @returns {() => void} Stops this observation; a no-op once it was replaced or released.
     */
    observe(element, handler, { debounceMs = 100, busy = false } = {}) {
        this.#release(element);
        /** @type {Observation} */
        const observation = { handler, debounceMs, busy, dueAt: null };
        this.#observations.set(element, observation);
        this.#resolveObserver().observe(element);
        return () => {
            if (this.#observations.get(element) === observation) this.#release(element);
        };
    }

    /**
     * Stop observing an element and drop its pending run.
     * @param {Element} element
     */
    #release(element) {
        const observation = this.#observations.get(element);
        if (!observation) return;
        // Also while its draw is still running: a replacing observation that is not busy
        // would never clear the mark.
        if (observation.busy) element.removeAttribute('aria-busy');
        this.#observations.delete(element);
        this.#observer?.unobserve(element);
    }
}

/**
 * What an owner needs of the resize service: `observe` alone, so a test hands in a
 * stand-in.
 * @typedef {{observe: (element: Element, handler: ResizeHandler, options?: {debounceMs?: number, busy?: boolean}) => () => void}} ResizeObserving
 */

/** @type {ResizeService} */
export const resizeService = new ResizeService();
