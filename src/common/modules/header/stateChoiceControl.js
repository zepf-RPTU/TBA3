/**
 * The state-bound choice header control — a mode switch or select whose chosen value
 * lives under one app-state key. One declaration, so the state binding has a single
 * home; the declaring app supplies the items and the key.
 * The app's initial state is the one place a default is written. Reading the key in
 * `injectState` is what makes the header follow it (see HeaderOrchestrator).
 */

/** @typedef {import('./headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */
/** @typedef {import('./headerModule.js').HeaderControlItem} HeaderControlItem */

/**
 * @template {object} TState
 * @param {{state: import('@tba3/module-base').State<TState>}} ctx - The app's header-control context over its state `TState` (extra members are ignored)
 * @param {object} spec - What is app-specific about this control
 * @param {'modeSwitch'|'select'} spec.type - Segmented switch or dropdown
 * @param {string} spec.id
 * @param {keyof TState & string} spec.stateKey - The app-state key the chosen value is stored under
 * @param {ReadonlyArray<HeaderControlItem>} [spec.items] - The choices, unless `resolveItems` builds them
 * @param {() => ReadonlyArray<HeaderControlItem>} [spec.resolveItems] - Builds the items on every render, for items that depend on loaded data
 * @param {() => boolean} [spec.resolveHidden] - Decides on every render whether the control is offered at all
 * @param {(value: string) => unknown} [spec.parseValue] - Turns the chosen item value into the stored state value
 * @param {import('./headerModule.js').HeaderControlOptions} [spec.options] - Static presentation options: classes and glossary sub-key
 * @returns {HeaderControlDeclaration} Its items and current value are injected from state on every render.
 */
export function stateChoiceControl(
    ctx,
    {
        type,
        id,
        stateKey,
        items = undefined,
        resolveItems = undefined,
        resolveHidden = undefined,
        parseValue = (value) => value,
        options = {},
    },
) {
    return {
        type,
        id,
        options: { ...options, items },
        injectState(control) {
            if (resolveItems) control.options.items = resolveItems();
            if (resolveHidden) control.options.hidden = resolveHidden();
            const offered = (control.options.items ?? []).filter((item) => !item.disabled);
            const value = String(ctx.state[stateKey].value);
            // The items offer every value the state can hold: a dataset switch reloads
            // the page, and a key whose items depend on the data is seeded once it lands.
            // Should that break, the control still renders with a choice shown.
            control.options.value = offered.some((item) => item.value === value)
                ? value
                : (offered[0]?.value ?? null);
        },
        /** @param {import('./headerModule.js').HeaderControlChange} data */
        onChange(data) {
            // A signal notifies only on a changed value, so a control re-firing its
            // current value reaches no watcher. The parsed value is the key's type by
            // the spec's contract, which the signal's invariant type cannot check.
            const target = /** @type {import('@preact/signals-core').Signal<unknown>} */ (
                /** @type {unknown} */ (ctx.state[stateKey])
            );
            target.value = parseValue(data.value);
        },
    };
}
