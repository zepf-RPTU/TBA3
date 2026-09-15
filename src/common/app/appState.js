/**
 * AppState — the state a dashboard app shares with everything it renders.
 *
 * Owns the keyed state bag and the comparison-group verbs on top of it. A plain
 * collaborator the coordinator *has*, not a `BaseModule` subclass — the app builds one in
 * `configure()` and hands it to views, child modules and chart configs as the
 * `appState` option.
 *
 * The point of the separate object is the seam, not the code: a view or a chart
 * config that needs the current mode has no business holding the whole app
 * coordinator, and a test that fakes six verbs is a fake anyone can read. The
 * shared `ensureComparisonModeDropdown(host, appState, getModes)` helper takes
 * exactly this shape.
 *
 * Mode state (a header switch, the ⌀ comparison toggles) is written here and
 * observed (`observe`) by whoever renders it — see BaseViewModule.observeState.
 * @module appState
 */

/**
 * @typedef {object} AppStateDeps
 * @property {object} [initialState] - The app's initial state, from `getInitialState()`
 */

export class AppState {
    /** @type {object} */
    #state;

    /** @type {Map<string, Set<(value: *, previous: *) => void>>} Observers per state key. */
    #observers = new Map();

    /**
     * @param {AppStateDeps} [deps] - The initial state.
     */
    constructor({ initialState = {} } = {}) {
        this.#state = { ...initialState };
    }

    /**
     * Update state with new values
     * @param {object} updates - State updates to merge
     */
    updateState(updates) {
        const previous = this.#state;
        this.#state = { ...previous, ...updates };

        // Notify only for keys whose value actually changed, so a control
        // re-firing with the same mode cascades nowhere.
        for (const key of Object.keys(updates)) {
            const value = this.#state[key];
            if (value === previous[key]) continue;
            for (const observer of [...(this.#observers.get(key) ?? [])]) {
                try {
                    observer(value, previous[key]);
                } catch (error) {
                    console.error(`AppState: Error in observer for "${key}":`, error);
                }
            }
        }
    }

    /**
     * Get a specific state value
     * @param {string} key - State key
     * @returns {*} State value
     */
    getStateValue(key) {
        return this.#state[key];
    }

    /**
     * Observe one state key. The observer runs after every `updateState` that
     * changes the key's value (strict inequality), with the new and the previous
     * value. Nothing is delivered on registration — read `getStateValue` for the
     * current value.
     * @param {string} key - State key
     * @param {(value: *, previous: *) => void} observer - Called on each change
     * @returns {() => void} Unsubscribe function
     */
    observe(key, observer) {
        let observers = this.#observers.get(key);
        if (!observers) {
            observers = new Set();
            this.#observers.set(key, observers);
        }
        observers.add(observer);
        return () => {
            observers.delete(observer);
        };
    }

    // ------------------------------------------------------------------------
    // Comparison state — the one owner of "which reference groups are shown".
    // Every app keeps `comparisonState` in its state, seeded at data load with the
    // comparison groups the dataset delivers; every averaging chart's ⌀ dropdown
    // reads and writes it here, and the views observe the key to keep the other
    // charts and dropdowns in step. Without the key an app simply reports nothing
    // active.
    // ------------------------------------------------------------------------

    /**
     * @returns {{[modeId: string]: boolean}} Comparison mode id → shown, as a copy.
     */
    getComparisonState() {
        return { ...(this.#state.comparisonState ?? {}) };
    }

    /**
     * @returns {string[]} The comparison mode ids currently toggled on.
     */
    getActiveComparisons() {
        return Object.entries(this.getComparisonState())
            .filter(([, active]) => active)
            .map(([modeId]) => modeId);
    }

    /**
     * Seed the comparison state at data load: every delivered comparison group
     * starts shown. Replaces the whole state, since it runs once per dataset and
     * a previous dataset's ids have no meaning for the new one. All three apps
     * call it with the ids their dataset delivers.
     * @param {Iterable<string>} modeIds - The comparison mode ids the dataset delivers.
     */
    seedComparisonState(modeIds) {
        const comparisonState = {};
        for (const modeId of modeIds) {
            comparisonState[modeId] = true;
        }
        this.updateState({ comparisonState });
    }

    /**
     * Set a comparison mode on/off. Public entry point for the per-module header
     * comparison toggles; updates the shared comparisonState, which the views
     * observe (`observeActiveComparisons`) to keep every averaging chart and the
     * other modules' toggles in sync. A write that changes nothing notifies nobody.
     * @param {string} modeId - Comparison mode id (e.g. 'school', 'state')
     * @param {boolean} active - Desired on/off state
     */
    setComparisonMode(modeId, active) {
        if (modeId === undefined) return;

        const comparisonState = this.getComparisonState();
        if (comparisonState[modeId] === active) return;
        comparisonState[modeId] = active;
        this.updateState({ comparisonState });
    }
}
