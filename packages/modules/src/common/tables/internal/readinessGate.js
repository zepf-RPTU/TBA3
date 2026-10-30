/**
 * Holds a TableModule's table operations until the table can take them: shown, and its
 * build settled. One keyed store, so a later operation under a key replaces the waiting
 * one wherever it waits. On show the waiting operations run synchronously, so the
 * caller's redraw lands in the same frame; behind a build they pass the gate again once
 * it has settled (a table hidden meanwhile holds them until shown, a newer build until
 * that one has settled), and an owner torn down drops them.
 */
export class ReadinessGate {
    /** @type {Map<string, () => void>} The waiting operations, in arrival order. */
    #waiting = new Map();
    /** Whether a settle is already awaited for the operations behind a build. */
    #settleAwaited = false;
    /** @type {() => boolean} */
    #isVisible;
    /** @type {() => boolean} */
    #isBuilding;
    /** @type {() => Promise<void>} */
    #whenSettled;
    /** @type {() => boolean} */
    #isClosed;
    /** @type {(error: unknown, key: string) => void} */
    #onError;

    /**
     * @param {object} deps
     * @param {() => boolean} deps.isVisible
     * @param {() => boolean} deps.isBuilding - True while a build is in flight.
     * @param {() => Promise<void>} deps.whenSettled - Resolves once every build in flight has settled.
     * @param {() => boolean} deps.isClosed - True once the owner is torn down.
     * @param {(error: unknown, key: string) => void} deps.onError - Sink for an operation that throws after it waited, with its key.
     */
    constructor({ isVisible, isBuilding, whenSettled, isClosed, onError }) {
        this.#isVisible = isVisible;
        this.#isBuilding = isBuilding;
        this.#whenSettled = whenSettled;
        this.#isClosed = isClosed;
        this.#onError = onError;
    }

    /**
     * Run an operation now if the table can take it, else hold it under its key in place
     * of the one waiting there. One that runs at once throws to the caller.
     * @param {string} key
     * @param {() => void} operation
     * @returns {boolean} False when it waits for the table to be shown.
     */
    run(key, operation) {
        this.#waiting.delete(key);
        if (this.#isVisible() && !this.#isBuilding()) {
            operation();
            return true;
        }
        this.#waiting.set(key, operation);
        if (!this.#isVisible()) return false;
        this.#awaitSettle();
        return true;
    }

    /**
     * Run what waited, as far as the table can take it; the owner calls it on show.
     */
    flush() {
        if (this.#isClosed()) {
            this.#waiting.clear();
            return;
        }
        for (const [key, operation] of this.#waiting) {
            // An operation may start a build, or hide the table: the rest wait for it.
            if (!this.#isVisible() || this.#isBuilding()) break;
            this.#waiting.delete(key);
            try {
                operation();
            } catch (error) {
                this.#onError(error, key);
            }
        }
        if (this.#waiting.size > 0 && this.#isVisible()) this.#awaitSettle();
    }

    #awaitSettle() {
        if (this.#settleAwaited) return;
        this.#settleAwaited = true;
        void this.#whenSettled().then(() => {
            this.#settleAwaited = false;
            this.flush();
        });
    }
}
