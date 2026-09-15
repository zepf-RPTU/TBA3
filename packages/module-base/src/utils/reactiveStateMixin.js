/**
 * Reactive state mixin — attaches `setState(partial)` / `getState(key?)` to any target
 * object, with referential-equality change detection that dispatches to the target's
 * `_onStateChanged(changedKeys, prevState)` hook.
 *
 * `applyReactiveState(this, this.getInitialState())` goes in the constructor. A target
 * defining no `_onStateChanged` takes state changes silently.
 * @module reactiveStateMixin
 */

/**
 * Shape that {@link applyReactiveState} installs on its target object. Consumers
 * that need checkJs to see these late-bound members should reference this
 * typedef (see chartRenderer.js / tableModule.js) rather than re-declaring the
 * members as bare `any`.
 * @typedef {object} ReactiveStateHost
 * @property {{[key: string]: any}} _state - Reactive state container
 * @property {(partialState: {[key: string]: any}) => void} setState - Merge a partial into state
 * @property {(key?: string) => any} getState - Read the full state copy, or one key's value
 */

/**
 * Attach reactive state management to a target object.
 * @param {object} target - The object to augment (typically `this`)
 * @param {object} [initialState={}] - Initial state values
 */
export function applyReactiveState(target, initialState = {}) {
    target._state = { ...initialState };

    /**
     * Merge partial state into the current state.
     * Only calls `_onStateChanged` when at least one value actually changed
     * (referential equality check per key).
     * @param {object} partialState - Keys to merge into state
     */
    target.setState = function setState(partialState) {
        if (!partialState || typeof partialState !== 'object') return;
        if (!this._state) return;

        // Detect changes first — only copy prevState if something actually changed
        const changedKeys = [];
        for (const key of Object.keys(partialState)) {
            if (this._state[key] !== partialState[key]) {
                changedKeys.push(key);
            }
        }
        if (changedKeys.length === 0) return;

        const prevState = { ...this._state };
        Object.assign(this._state, partialState);

        if (typeof this._onStateChanged === 'function') {
            this._onStateChanged(changedKeys, prevState);
        }
    };

    /**
     * Get current state or a specific key.
     * @param {string} [key] - Optional key to retrieve
     * @returns {*} Full state copy (if no key) or specific key value
     */
    target.getState = function getState(key) {
        if (!this._state) return key !== undefined ? undefined : {};
        return key !== undefined ? this._state[key] : { ...this._state };
    };
}
