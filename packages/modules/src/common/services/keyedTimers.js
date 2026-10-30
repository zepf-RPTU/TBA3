/** Pending `setTimeout`s by key, at most one per key. */
export class KeyedTimers {
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    #timers = new Map();

    /**
     * Run `fn` after `delayMs`, replacing whatever was pending under `key`.
     * @param {string} key
     * @param {number} delayMs
     * @param {() => void} fn
     */
    schedule(key, delayMs, fn) {
        this.cancel(key);
        this.#timers.set(
            key,
            setTimeout(() => {
                this.#timers.delete(key);
                fn();
            }, delayMs),
        );
    }

    /**
     * Clear the timer pending under `key`; a no-op when nothing is.
     * @param {string} key
     */
    cancel(key) {
        clearTimeout(this.#timers.get(key));
        this.#timers.delete(key);
    }

    clear() {
        for (const timer of this.#timers.values()) clearTimeout(timer);
        this.#timers.clear();
    }

    /**
     * @param {string} key
     * @returns {boolean} Whether a timer is pending under `key`.
     */
    has(key) {
        return this.#timers.has(key);
    }
}
