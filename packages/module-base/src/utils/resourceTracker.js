/**
 * ResourceTracker — Tracks DOM listeners, timeouts, animation frames and
 * subscriptions for bulk cleanup.
 *
 * DOM listeners ride on one AbortController. Subscriptions share one teardown list,
 * run last-tracked-first (the `DisposableStack` order). The owning class calls
 * `destroy()`; whatever is tracked after it is released at once.
 */

class ResourceTracker {
    #abort = new AbortController();
    /** @type {Set<ReturnType<typeof setTimeout>>} */
    #pendingTimeouts = new Set();
    /** @type {Set<number>} */
    #pendingAnimationFrames = new Set();
    /** @type {Array<() => void>} */
    #teardowns = [];
    #destroyed = false;
    #label;

    /**
     * @param {string} label - identifier for error messages
     */
    constructor(label) {
        this.#label = label;
    }

    /**
     * @param {EventTarget} element - What to listen on: an element, `document` or `window`.
     * @param {string} eventType
     * @param {EventListenerOrEventListenerObject} handler
     * @param {AddEventListenerOptions} [options]
     */
    trackDomListener(element, eventType, handler, options) {
        element.addEventListener(eventType, handler, {
            ...options,
            signal: this.#abort.signal,
        });
    }

    /**
     * Schedule a timeout that destroy() clears while it is pending.
     * @param {Function} callback
     * @param {number} delayMs
     * @returns {ReturnType<typeof setTimeout>}
     */
    trackTimeout(callback, delayMs) {
        const id = setTimeout(() => {
            this.#pendingTimeouts.delete(id);
            callback();
        }, delayMs);
        if (this.#destroyed) clearTimeout(id);
        else this.#pendingTimeouts.add(id);
        return id;
    }

    /**
     * Request an animation frame that destroy() cancels while it is pending.
     * @param {Function} callback
     * @returns {number}
     */
    trackAnimationFrame(callback) {
        const id = requestAnimationFrame(() => {
            this.#pendingAnimationFrames.delete(id);
            callback();
        });
        if (this.#destroyed) cancelAnimationFrame(id);
        else this.#pendingAnimationFrames.add(id);
        return id;
    }

    /**
     * Call `unsubscribeFn` once, on destroy(), or at once when that has already run: a
     * subscription an async step makes after its owner left would otherwise live forever.
     * @template {() => void} T
     * @param {T} unsubscribeFn
     * @returns {T} The same function (for chaining / storage)
     */
    trackSubscription(unsubscribeFn) {
        if (this.#destroyed) unsubscribeFn();
        else this.#teardowns.push(unsubscribeFn);
        return unsubscribeFn;
    }

    /** Tear down all tracked resources. Idempotent. */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;

        this.#abort.abort();
        this.#pendingTimeouts.forEach((id) => clearTimeout(id));
        this.#pendingAnimationFrames.forEach((id) => cancelAnimationFrame(id));

        // Foreign teardown code from here on, last tracked first. One that throws must
        // not strand the resources behind it: `#destroyed` is already set, so nothing
        // comes back for them.
        for (const teardown of this.#teardowns.reverse()) {
            try {
                teardown();
            } catch (e) {
                console.error(`ResourceTracker[${this.#label}]: Error in teardown:`, e);
            }
        }
        this.#teardowns = [];
    }
}

export { ResourceTracker };
