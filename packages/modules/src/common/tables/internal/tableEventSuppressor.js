/**
 * Counted suppression of Tabulator events.
 *
 * A collaborator the TableModule *has*, not *is* (mirrors the #presetManager
 * pattern). It owns the per-event suppression counters so that nested
 * `withSuppressed` calls compose: suppression is counted, not boolean, so an
 * inner scope releasing does not prematurely re-enable events for an outer scope.
 * The wildcard `'*'` key suppresses every event.
 *
 * The one impurity — deferred release timing — is injected: the owner passes a
 * `scheduleDeferredRelease` bound to its tracked-timeout manager so a
 * `release: 'timeout'` release is cleaned up automatically on teardown.
 */
export class TableEventSuppressor {
    /** @type {Map<string, number>} per-event suppression depth ('*' = all events) */
    #counts = new Map();
    /** @type {(release: () => void) => void} */
    #scheduleDeferredRelease;

    /**
     * @param {(release: () => void) => void} scheduleDeferredRelease - Schedules a
     *   release callback on the next task (wire to the owner's tracked timeout so
     *   it auto-cleans on destroy).
     */
    constructor(scheduleDeferredRelease) {
        this.#scheduleDeferredRelease = scheduleDeferredRelease;
    }

    #normalizeEventNames(eventNames) {
        if (eventNames == null) return ['*'];
        return Array.isArray(eventNames) ? eventNames : [eventNames];
    }

    /**
     * Whether a given Tabulator event is currently suppressed (directly or via '*').
     * @param {string} eventName - Tabulator event name (e.g. 'dataFiltered')
     * @returns {boolean} True while a `withSuppressed` call is holding that event, directly or via `'*'`.
     */
    isSuppressed(eventName) {
        return (
            (this.#counts.get('*') ?? 0) > 0 ||
            (eventName ? (this.#counts.get(eventName) ?? 0) > 0 : false)
        );
    }

    /**
     * Suppress one or more Tabulator events until the returned release function is called.
     * @param {string|string[]} [eventNames='*'] - Event name or names to suppress
     * @returns {() => void} Idempotent release function
     */
    suppress(eventNames = '*') {
        const normalizedNames = this.#normalizeEventNames(eventNames);
        let released = false;

        normalizedNames.forEach((eventName) => {
            this.#counts.set(eventName, (this.#counts.get(eventName) ?? 0) + 1);
        });

        return () => {
            if (released) return;
            released = true;

            normalizedNames.forEach((eventName) => {
                const currentValue = this.#counts.get(eventName) ?? 0;
                if (currentValue <= 1) {
                    this.#counts.delete(eventName);
                } else {
                    this.#counts.set(eventName, currentValue - 1);
                }
            });
        };
    }

    /**
     * Execute an operation while temporarily suppressing one or more Tabulator events.
     * Use `release: 'timeout'` for operations whose follow-up events can fire on the next task.
     * @param {string|string[]} eventNames - Event name or names to suppress
     * @param {Function} operation - Operation to execute while suppressed
     * @param {object} [options] - When to release the suppression.
     * @param {'sync'|'timeout'} [options.release='sync'] - When to release suppression
     */
    withSuppressed(eventNames, operation, options = {}) {
        const { release = 'sync' } = options;
        const releaseSuppression = this.suppress(eventNames);

        try {
            operation?.();
        } finally {
            if (release === 'sync') {
                releaseSuppression();
            } else {
                this.#scheduleDeferredRelease(releaseSuppression);
            }
        }
    }

    /** Drop all suppression counters (call on teardown). */
    clear() {
        this.#counts.clear();
    }
}
