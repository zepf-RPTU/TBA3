/**
 * withTableModeState — class-factory mixin adding mode-switching reactive state to a
 * TableModule subclass, under a configurable `stateKey` (`'mode'`, `'vizMode'`).
 *
 * The owning view pushes the mode with `setState({ [stateKey]: value })` from an
 * app-state observer, and a standalone host uses the same shape: modes are state, not
 * events. `_onStateChanged` defers the apply hook through `deferOperationUntilVisible`.
 *
 * The subclass implements the hook named by `applyHookName`, or inherits it: the
 * fallback delegates through `super`, so a parent base class — `SlBaseTableModule`'s
 * `_applyVizModeChange` — satisfies it through the prototype chain.
 */

/**
 * Create a mode-state mixin bound to the given configuration.
 * @param {typeof import('./tableModule.js').TableModule} Base - Table module class the mixin extends.
 * @param {object} config - Binds the mixin to one state key.
 * @param {string} config.stateKey - Key the mode is stored under in `_state` (e.g. `'mode'`, `'vizMode'`).
 * @param {*} config.initialValue - Static starting value, or a method computing it from the module options (invoked with the module as `this`).
 * @param {string} config.applyHookName - Method the subclass (or a parent in the prototype chain) must implement to apply a mode change.
 * @returns {typeof import('./tableModule.js').TableModule} The extended class, with the mode state and deferred apply-hook wired in.
 */
export function withTableModeState(Base, { stateKey, initialValue, applyHookName }) {
    return class extends Base {
        /**
         * @param {string} id - Module id.
         * @param {string|HTMLElement} container - Container element or selector.
         * @param {object} options - Table module options; the mixin reads its initial mode from them.
         */
        constructor(id, container, options = {}) {
            super(id, container, options);

            // Resolve the initial value — supports both static values and functions
            const resolvedInitialValue =
                typeof initialValue === 'function'
                    ? initialValue.call(this, options)
                    : initialValue;

            // Initialize reactive state with the configured key
            Object.assign(this._state, { [stateKey]: resolvedInitialValue });
        }

        // ====================================================================
        // REACTIVE STATE
        // ====================================================================

        /**
         * React to state changes with optimized updates.
         * When the configured `stateKey` changes, defers the apply-hook
         * via `deferOperationUntilVisible` so hidden tabs queue updates.
         *
         * Guards on `this.initialized` rather than `this.table` because
         * SL modules manage multiple Tabulator instances (no single
         * `this.table`). For single-table EN modules `initialized` is
         * equivalent — the table is created during `render()`, which
         * sets `initialized = true`.
         * @override
         * @param {string[]} changedKeys - Which state keys changed on this update.
         * @param {object} prevState - The state as it was before the change.
         */
        _onStateChanged(changedKeys, prevState) {
            if (changedKeys.includes(stateKey)) {
                if (!this.initialized) return;
                // A module whose export identity includes this state key (EN's
                // domain switch) now shows something else, and this path never
                // re-renders through ContentModule. Modules that do not scope on
                // it (SL's vizMode) just re-register the id they already had.
                this.syncExportControls();
                this.deferOperationUntilVisible(stateKey + 'Change', () =>
                    this[applyHookName](this._state[stateKey]),
                );
                return;
            }
            super._onStateChanged(changedKeys, prevState);
        }

        // ====================================================================
        // TABLE LIFECYCLE — structural mode application
        // ====================================================================

        /**
         * Guarantee that the current mode is applied once the table is
         * fully operational (after `tableBuilt` + initial redraw).
         *
         * This is the **structural** fix for the "late-init" problem:
         * when a view is initialized after the user already toggled
         * domain mode, the mixin constructor correctly stores the value
         * in `_state`, but `setState()` is a no-op (same value →
         * `_onStateChanged` never fires).  By hooking into the
         * post-build lifecycle we side-step that entirely.
         *
         * Subclasses that override `_onTableReady` should call
         * `super._onTableReady()` **first** so the mode/filter is
         * applied before they read filtered rows.
         * @override
         * @protected
         */
        _onTableReady() {
            this[applyHookName](this._state[stateKey]);
            super._onTableReady?.();
        }

        // ====================================================================
        // ABSTRACT HOOK VALIDATION
        // ====================================================================

        /**
         * Fallback that delegates to a parent class (e.g. SlBaseTableModule)
         * if available, otherwise throws to signal a missing implementation.
         * @param {*} value - New mode value
         * @returns {*} Whatever the parent implementation returned.
         */
        [applyHookName](value) {
            if (typeof super[applyHookName] === 'function') {
                return super[applyHookName](value);
            }
            throw new Error(`${this.constructor.name} must implement ${applyHookName}(value)`);
        }
    };
}
