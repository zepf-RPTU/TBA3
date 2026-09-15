/**
 * Defers table operations until the container is on-screen.
 *
 * A collaborator the TableModule *has*, not *is*. It owns the pending-operation
 * list and the replace-by-key semantics: an operation queued while the table is
 * hidden runs when the module is next shown, and re-queuing the same `key`
 * replaces the earlier one (so, e.g., a data update deferred twice runs once with
 * the latest closure).
 *
 * The module-specific parts are injected so the queue stays pure and testable:
 * the visibility predicate, the flush scheduler (owns the destroyed-guard and
 * decides whether drained operations run synchronously or on a later frame), and
 * the per-operation error sink.
 */
export class VisibilityDeferralQueue {
    /** @type {Array<{ key: string, operation: Function }>} */
    #pending = [];
    /** @type {() => boolean} */
    #isVisible;
    /** @type {(runDrained: () => void) => void} */
    #scheduleFlush;
    /** @type {(error: unknown) => void} */
    #onError;

    /**
     * @param {object} deps - How the queue learns it is visible, how it schedules a flush, and where errors go.
     * @param {() => boolean} deps.isVisible - Whether the container is currently on-screen
     * @param {(runDrained: () => void) => void} deps.scheduleFlush - Runs (or schedules)
     *   the drained operations; should skip running if the owner was destroyed in the
     *   meantime
     * @param {(error: unknown) => void} deps.onError - Sink for an individual operation's error
     */
    constructor({ isVisible, scheduleFlush, onError }) {
        this.#isVisible = isVisible;
        this.#scheduleFlush = scheduleFlush;
        this.#onError = onError;
    }

    /**
     * Execute an operation immediately if the container is visible, otherwise defer
     * it until the next flush. A pending operation with the same key is replaced.
     * @param {string} key - Unique key (used to replace an existing pending op)
     * @param {Function} operation - Operation to execute (receives no arguments)
     * @returns {boolean} True if executed immediately, false if deferred
     */
    runOrDefer(key, operation) {
        if (this.#isVisible()) {
            operation();
            return true;
        }

        // Remove any existing pending operation with the same key, then enqueue.
        this.#pending = this.#pending.filter((op) => op.key !== key);
        this.#pending.push({ key, operation });
        return false;
    }

    /**
     * Drain and execute all pending operations via the injected flush scheduler.
     * Each operation is isolated so one failure does not skip the rest.
     * @param {() => void} [onDrained] - Called after the drained operations have
     *   actually run (not merely scheduled) — for a caller whose own follow-up
     *   work (e.g. a redraw) must reflect the deferred content change rather
     *   than run before it lands.
     * @returns {boolean} True if any operations were drained (and handed to the
     *   flush scheduler), false if the queue was empty. Callers use this to tell whether
     *   deferred work — which can change content and thus layout — will run.
     */
    flush(onDrained) {
        if (this.#pending.length === 0) return false;

        const operations = this.#pending;
        this.#pending = [];

        this.#scheduleFlush(() => {
            operations.forEach(({ operation }) => {
                try {
                    operation();
                } catch (error) {
                    this.#onError(error);
                }
            });
            onDrained?.();
        });

        return true;
    }
}
