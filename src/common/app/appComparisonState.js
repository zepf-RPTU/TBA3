/**
 * The tba3 adapter for the chart layer's comparison-state port.
 *
 * `AppState` is ours, so the adapter is too: the charts speak the port, this maps it
 * onto the one `comparisonState` key every app seeds at data load. One instance per
 * app, handed to views alongside `appState`.
 */

/**
 * Wrap an app state as the port the chart layer expects.
 * @param {import('./appState.js').AppState} appState - The app's shared state.
 * @returns {import('@tba3/modules/common/charts/comparisonState.js').ComparisonState} The port, backed by `comparisonState`.
 */
export function comparisonStateFromAppState(appState) {
    return {
        getActiveModes: () => appState.getActiveComparisons(),
        isActive: (id) => Boolean(appState.getComparisonState()[id]),
        setActive: (id, active) => appState.setComparisonMode(id, active),
        subscribe: (callback) =>
            appState.observe('comparisonState', () => callback(appState.getActiveComparisons())),
    };
}
