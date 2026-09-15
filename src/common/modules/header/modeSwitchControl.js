/**
 * The mode-switch header control — the one declared unit every app mounts for a
 * segmented "which mode" choice (EN Domäne, MA layout, SL view/display/viz and
 * the two Verlauf toggles). Shared so the state binding and the no-op guard have a
 * single home; the per-app catalogs (src/{en,ma,sl}/*HeaderControls.js) supply the
 * modes and the state key. Consumers observe the state key
 * (BaseViewModule.observeState); a switch publishes no event.
 */

/**
 * @param {{
 *   getStateValue: (key: string) => any,
 *   updateState: (patch: object) => void
 * }} ctx - The app's header-control context (extra members are ignored)
 * @param {object} spec - What is app-specific about this switch
 * @param {string} spec.id - Control id
 * @param {Array<{id: string, label: string, glossarySubKey?: string}>} spec.modes - The selectable modes
 * @param {string} spec.stateKey - The app-state key the chosen mode is stored under
 * @param {string} spec.defaultMode - The mode shown before the state holds one
 * @param {() => boolean} [spec.resolveHidden] - Decides on every render whether the control is offered at all
 * @returns {object} A header-control definition: a mode switch whose current mode is injected from state on every render.
 */
export function modeSwitchControl(
    ctx,
    { id, modes, stateKey, defaultMode, resolveHidden = undefined },
) {
    return {
        type: 'modeSwitch',
        id,
        options: {
            modes,
            defaultMode,
            containerClass: 'header-module-mode-switch',
        },
        injectState(control) {
            control.options.defaultMode = ctx.getStateValue(stateKey) ?? defaultMode;
            if (resolveHidden) control.options.hidden = resolveHidden();
        },
        onChange(data) {
            if (!data?.mode) return;
            // Skip no-op writes — a control re-firing with the same mode has
            // nothing for the observers to apply.
            if (ctx.getStateValue(stateKey) === data.mode) return;

            ctx.updateState({ [stateKey]: data.mode });
        },
    };
}
