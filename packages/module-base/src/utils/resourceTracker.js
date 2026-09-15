/**
 * ResourceTracker — Tracks DOM listeners, timeouts, animation frames,
 * subscriptions, and disposable resources for bulk cleanup.
 *
 * Composed into BaseModule and ChartRenderer via a `resources` getter.
 * Subclasses of either class track resources via `this.resources.trackX()`.
 *
 * Timeouts and rAFs self-remove from tracking when they fire.
 * Everything is torn down idempotently in `destroy()`.
 * Usage:
 *   // In a module or chart renderer:
 *   this.resources.trackDomListener(el, 'click', handler);
 *   this.resources.trackTimeout(() => applyFilter(), 300);
 *   this.resources.trackSubscription(appState.observe(key, fn));
 *   this.resources.trackDisposable(someObject);
 *
 *   // On destroy — called automatically by the owning class:
 *   this.resources.destroy();
 */

class ResourceTracker {
    #domListeners; // Array<{ element, type, handler, options }>
    #pendingTimeouts; // Set<number>
    #pendingAnimationFrames; // Set<number>
    #subscriptions; // Set<Function> — unsubscribe callbacks
    #disposables; // Array<{destroy()}> — torn down back to front; see destroy()
    #destroyed;
    #label;

    /**
     * @param {string} [label='ResourceTracker'] - identifier for error messages
     */
    constructor(label = 'ResourceTracker') {
        this.#label = label;
        this.#domListeners = [];
        this.#pendingTimeouts = new Set();
        this.#pendingAnimationFrames = new Set();
        this.#subscriptions = new Set();
        this.#disposables = [];
        this.#destroyed = false;
    }

    get destroyed() {
        return this.#destroyed;
    }

    /**
     * Add a DOM event listener and track it for automatic cleanup.
     * @param {EventTarget} element - What to listen on: an element, `document` or `window`.
     * @param {string} eventType - Event type (e.g., 'click', 'change')
     * @param {EventListenerOrEventListenerObject} handler - Event handler function
     * @param {boolean|AddEventListenerOptions} [options] - Optional addEventListener options
     */
    trackDomListener(element, eventType, handler, options) {
        element.addEventListener(eventType, handler, options);
        this.#domListeners.push({ element, type: eventType, handler, options });
    }

    /**
     * Schedule a timeout and track it for automatic cleanup.
     * Auto-removed from tracking when it fires.
     * @param {Function} callback - Function to execute after delay
     * @param {number} delay - Delay in milliseconds
     * @returns {number} The timeout ID
     */
    trackTimeout(callback, delay) {
        const id = setTimeout(() => {
            this.#pendingTimeouts.delete(id);
            callback();
        }, delay);
        this.#pendingTimeouts.add(id);
        return id;
    }

    /**
     * Schedule a requestAnimationFrame and track it for automatic cleanup.
     * Auto-removed from tracking when it fires.
     * @param {Function} callback - Function to execute on next animation frame
     * @returns {number} The animation frame ID
     */
    trackAnimationFrame(callback) {
        const id = requestAnimationFrame(() => {
            this.#pendingAnimationFrames.delete(id);
            callback();
        });
        this.#pendingAnimationFrames.add(id);
        return id;
    }

    /**
     * Track a subscription for automatic teardown on destroy.
     * The provided function is called once during destroy().
     * @param {Function} unsubscribeFn - Teardown function
     * @returns {Function} The same function (for chaining / storage)
     */
    trackSubscription(unsubscribeFn) {
        this.#subscriptions.add(unsubscribeFn);
        return unsubscribeFn;
    }

    /**
     * Track an external resource for automatic teardown on destroy.
     * Must expose a `.destroy()` method. Torn down back to front, and a disposable may
     * untrack itself from inside its own `destroy()`; untracking a *sibling* there is
     * not supported.
     * @template {{destroy: () => void}} T
     * @param {T} disposable - Object with a `.destroy()` method
     * @returns {T} The same disposable (for assignment chaining)
     * @throws {TypeError} If the disposable lacks a `.destroy()` method
     */
    trackDisposable(disposable) {
        if (!disposable || typeof disposable.destroy !== 'function') {
            throw new TypeError(
                `ResourceTracker[${this.#label}]: trackDisposable requires an object with a .destroy() method`,
            );
        }
        this.#disposables.push(disposable);
        return disposable;
    }

    /**
     * Stop tracking a disposable without destroying it.
     * For one-shot disposables that have already done their job — a cancel handle
     * for a timeout that has fired — since leaving them tracked grows the list on
     * every repeated render.
     * @param {{destroy: () => void}} disposable - A previously tracked disposable
     * @returns {boolean} True if it was tracked and has now been removed
     */
    untrackDisposable(disposable) {
        const index = this.#disposables.indexOf(disposable);
        if (index === -1) return false;
        this.#disposables.splice(index, 1);
        return true;
    }

    /**
     * Tear down all tracked resources. Idempotent — safe to call more than once.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;

        this.#domListeners.forEach(({ element, type, handler, options }) => {
            element.removeEventListener(type, handler, options);
        });

        this.#pendingTimeouts.forEach((id) => clearTimeout(id));

        this.#pendingAnimationFrames.forEach((id) => cancelAnimationFrame(id));

        // Foreign teardown code from here on. A subscription or a disposable that throws must
        // not strand the resources behind it, and `#destroyed` is already set, so nothing will
        // come back for them — report and carry on.
        this.#subscriptions.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                console.error(
                    `ResourceTracker[${this.#label}]: Error in subscription teardown:`,
                    e,
                );
            }
        });

        // Back to front because `untrackDisposable` splices, and a disposable may call it
        // on itself from inside its own `destroy()` — remountChartHost's cancel handle
        // does. Walking down, that splice only shifts entries already visited; walking up,
        // the entry that slides into the vacated slot would be skipped. It also means the
        // reverse is unsupported: untracking a *sibling* here shifts an already-destroyed
        // entry back under the cursor and destroys it twice.
        for (let i = this.#disposables.length - 1; i >= 0; i--) {
            try {
                this.#disposables[i].destroy();
            } catch (e) {
                console.error(`ResourceTracker[${this.#label}]: Error in disposable teardown:`, e);
            }
        }
    }
}

export { ResourceTracker };
