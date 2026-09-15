/**
 * Settle-then-redraw scheduling for a Tabulator table.
 *
 * A collaborator the TableModule *has*, not *is*. It owns the single overlap guard
 * (`#pendingRedraw`) shared by all redraw paths so a settle redraw and a show-time
 * synchronous redraw never stack, and it centralizes the "force a layout flush,
 * only redraw the current built + on-screen table" rules.
 *
 * The module-specific state is injected as thin accessors so the scheduler stays a
 * pure timing/guard machine: which table is current, whether it is built, whether
 * the owner was destroyed, the container (for the visibility check + forced
 * reflow), and the frame scheduler (wired to the module's tracked resources).
 */
export class TableRedrawScheduler {
    /** Guards against overlapping redraw scheduling across all redraw paths. */
    #pendingRedraw = false;
    /** @type {() => (object|null)} */
    #getTable;
    /** @type {() => boolean} */
    #isBuilt;
    /** @type {() => boolean} */
    #isDestroyed;
    /** @type {() => (HTMLElement|null)} */
    #getContainer;
    /** @type {(cb: () => void) => void} */
    #scheduleFrame;

    /**
     * @param {object} deps - How the scheduler reaches the live table and schedules a frame.
     * @param {() => (object|null)} deps.getTable - The current Tabulator instance
     * @param {() => boolean} deps.isBuilt - Whether the table's `tableBuilt` has fired
     * @param {() => boolean} deps.isDestroyed - Whether the owning module was destroyed
     * @param {() => (HTMLElement|null)} deps.getContainer - The table container element
     * @param {(cb: () => void) => void} deps.scheduleFrame - Schedules a callback on the
     *   next animation frame (wire to the owner's tracked rAF so it auto-cleans)
     */
    constructor({ getTable, isBuilt, isDestroyed, getContainer, scheduleFrame }) {
        this.#getTable = getTable;
        this.#isBuilt = isBuilt;
        this.#isDestroyed = isDestroyed;
        this.#getContainer = getContainer;
        this.#scheduleFrame = scheduleFrame;
    }

    /**
     * Synchronously redraw the table, but only if it is still the current, built,
     * non-destroyed table (and, when required, on-screen). Forces a layout flush so
     * Tabulator measures the final container dimensions.
     * @param {object} [table] - Table to redraw (defaults to the current one)
     * @param {object} [options] - Whether an off-screen table should be skipped.
     * @param {boolean} [options.requireVisible=true] - Skip when the container has no size
     * @returns {boolean} Whether a redraw actually happened
     */
    redrawNow(table = this.#getTable(), { requireVisible = true } = {}) {
        if (!table || table !== this.#getTable() || !this.#isBuilt() || this.#isDestroyed()) {
            return false;
        }

        const container = this.#getContainer();
        if (
            requireVisible &&
            container &&
            (container.offsetWidth === 0 || container.offsetHeight === 0)
        ) {
            return false;
        }

        if (container) {
            void container.offsetWidth;
        }

        table.redraw(true);
        return true;
    }

    /**
     * Schedule a redraw on the next animation frame, optionally followed by a second
     * settle redraw and an `afterRedraw` callback. Skips when a redraw is already
     * pending so overlapping schedules collapse into one.
     * @param {object} [options] - Which table, what to run afterwards, and whether to settle with a second pass.
     * @param {object} [options.table] - Table to redraw (defaults to the current one)
     * @param {(() => void)|null} [options.afterRedraw] - Runs after the redraw settles
     * @param {boolean} [options.followUp=true] - Do a second settle redraw one frame later
     * @param {boolean} [options.requireVisible=true] - Skip when the container has no size
     * @returns {boolean} Whether the redraw was scheduled
     */
    scheduleSettled({
        table = this.#getTable(),
        afterRedraw = /** @type {(() => void)|null} */ (null),
        followUp = true,
        requireVisible = true,
    } = {}) {
        if (!table || table !== this.#getTable() || !this.#isBuilt() || this.#pendingRedraw) {
            return false;
        }

        this.#pendingRedraw = true;

        this.#scheduleFrame(() => {
            const finish = (runAfterRedraw = true) => {
                this.#pendingRedraw = false;
                if (runAfterRedraw && !this.#isDestroyed() && table === this.#getTable()) {
                    afterRedraw?.();
                }
            };

            if (!this.redrawNow(table, { requireVisible })) {
                finish(false);
                return;
            }

            if (!followUp) {
                finish();
                return;
            }

            this.#scheduleFrame(() => {
                finish(this.redrawNow(table, { requireVisible }));
            });
        });

        return true;
    }

    /**
     * The show()-time pattern: a guarded synchronous redraw that participates in the
     * same overlap guard as scheduleSettled(), so it is skipped while a settle redraw
     * is pending and cannot itself overlap one.
     * @returns {boolean} Whether a redraw actually happened
     */
    redrawNowGuarded() {
        if (!this.#getTable() || !this.#isBuilt() || this.#pendingRedraw) {
            return false;
        }

        this.#pendingRedraw = true;
        try {
            return this.redrawNow();
        } finally {
            this.#pendingRedraw = false;
        }
    }

    /** Reset the overlap guard (call on hide so a later show schedules a fresh redraw). */
    resetGuard() {
        this.#pendingRedraw = false;
    }
}
